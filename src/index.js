import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'node:fs';
import path from 'node:path';
import { loadContentCache, getContent, getChannelUrl } from './content.js';
import {
  States,
  emptyDraft,
  withBookingSession,
  insertApplication,
  getSubmissions,
  findSubmission,
  markCancelled,
  draftFromSubmission,
  clearAiContext,
} from './session.js';
import { appendApplicationRow } from './sheets.js';
import { getAiIntentReply } from './ai.js';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('Задайте BOT_TOKEN в .env');
  process.exit(1);
}

/** Пусто по умолчанию: на Replit/Render нет вашего локального диска C:\ */
const START_PHOTO_PATH = String(process.env.START_PHOTO_PATH || '').trim();

function getValidStartPhotoPath() {
  if (!START_PHOTO_PATH) return null;
  const resolved = path.isAbsolute(START_PHOTO_PATH)
    ? START_PHOTO_PATH
    : path.resolve(process.cwd(), START_PHOTO_PATH);
  const ext = path.extname(resolved).toLowerCase();
  const imageExt = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
  if (!imageExt.has(ext)) {
    console.warn(`[start.photo] START_PHOTO_PATH не является изображением: ${resolved}`);
    return null;
  }
  if (!fs.existsSync(resolved)) {
    console.warn(`[start.photo] Файл не найден: ${resolved}`);
    return null;
  }
  return resolved;
}

function applyMainMenu(session) {
  session.state = States.MAIN_MENU;
  session.draft = emptyDraft();
  session.editingSubmissionId = null;
  session.resumeToConfirm = false;
}

function mainReplyKeyboard() {
  return {
    keyboard: [
      [{ text: ui('menu_book', 'Записаться на урок') }],
      [{ text: ui('menu_faq', 'Ответы на частые вопросы') }, { text: ui('menu_channel', 'Канал Даши') }],
      [{ text: ui('menu_contact', 'Связаться с преподавателем') }, { text: ui('menu_requests', 'Мои заявки') }],
    ],
    resize_keyboard: true,
  };
}

function removeKeyboard() {
  return { remove_keyboard: true };
}

function formatDateRu(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normId(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase();
}

function ui(key, fallback) {
  return getContent().strings?.[key] || fallback;
}

function normalizeText(v) {
  return String(v ?? '').trim();
}

function isLikelyName(text) {
  const t = normalizeText(text);
  if (!t) return false;
  // 1-2 слова, без цифр, для удобного быстрого ввода имени
  if (/\d/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 2) return false;
  return /^[A-Za-zА-Яа-яЁё\-\s]+$/.test(t);
}

function isLikelyContact(text) {
  const t = normalizeText(text);
  if (!t) return false;
  const phone = t.replace(/[^\d+]/g, '');
  if (phone.length >= 7 && /\d/.test(phone)) return true;
  return /^@?[A-Za-z0-9_]{3,32}$/.test(t);
}

function looksLikeTopicSwitch(text) {
  const t = normId(text);
  return [
    'как',
    'почему',
    'сколько',
    'цена',
    'стоим',
    'перенес',
    'отмен',
    'связ',
    'контакт',
    'канал',
    'faq',
  ].some((k) => t.includes(k));
}

function servicesKeyboard() {
  const rows = getContent().services.map((s) => [
    { text: `${s.title} (${s.price})`, callback_data: `book:svc:${s.id}` },
  ]);
  return { inline_keyboard: rows };
}

function levelsKeyboard() {
  const rows = getContent().englishLevels.map((l) => [{ text: l.label, callback_data: `book:lv:${l.id}` }]);
  return { inline_keyboard: rows };
}

function timeKeyboard() {
  const uiLabelById = {
    morning: 'Утро (9:00–12:00)',
    day: 'День (12:00–17:00)',
    evening: 'Вечер (17:00–21:00)',
    weekend: 'Только выходные',
  };
  const rows = getContent().timePresets.map((t) => [
    { text: uiLabelById[t.id] || t.label, callback_data: `book:tm:${t.id}` },
  ]);
  rows.push([{ text: ui('time_custom_btn', 'Напишу дату и время текстом'), callback_data: 'book:tm:custom' }]);
  return { inline_keyboard: rows };
}

function commentKeyboard() {
  return {
    inline_keyboard: [[{ text: 'Пропустить комментарий', callback_data: 'book:skip_comment' }]],
  };
}

function confirmKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'Подтвердить', callback_data: 'book:confirm_yes' },
        { text: 'Изменить', callback_data: 'book:confirm_edit' },
      ],
    ],
  };
}

function editFieldKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Услуга', callback_data: 'book:edit:service' }],
      [{ text: 'Имя', callback_data: 'book:edit:name' }],
      [{ text: 'Телефон / username', callback_data: 'book:edit:contact' }],
      [{ text: 'Уровень', callback_data: 'book:edit:level' }],
      [{ text: 'Цель', callback_data: 'book:edit:goal' }],
      [{ text: 'Время', callback_data: 'book:edit:time' }],
      [{ text: 'Комментарий', callback_data: 'book:edit:comment' }],
      [{ text: '« К подтверждению', callback_data: 'book:edit_back' }],
    ],
  };
}

function faqKeyboard() {
  const rows = getContent().faqItems.map((f) => [
    { text: f.question.slice(0, 60), callback_data: `faq:${f.id}` },
  ]);
  rows.push([{ text: '« В меню', callback_data: 'nav:main' }]);
  return { inline_keyboard: rows };
}

async function myRequestsKeyboard(userId) {
  const list = (await getSubmissions(userId)).filter((s) => s.status === 'active').slice(0, 8);
  if (!list.length) {
    return {
      inline_keyboard: [[{ text: '« В меню', callback_data: 'nav:main' }]],
    };
  }
  const rows = list.map((s) => [
    {
      text: `${formatDateRu(s.createdAt)} — ${s.serviceTitle || 'заявка'}`,
      callback_data: `req:open:${s.id}`,
    },
  ]);
  rows.push([{ text: '« В меню', callback_data: 'nav:main' }]);
  return { inline_keyboard: rows };
}

function requestActionKeyboard(submissionId) {
  return {
    inline_keyboard: [
      [
        { text: 'Отменить', callback_data: `req:cancel:${submissionId}` },
        { text: 'Изменить', callback_data: `req:edit:${submissionId}` },
      ],
      [{ text: '« К списку', callback_data: 'nav:my_req' }],
    ],
  };
}

async function main() {
  await loadContentCache();
  const content = getContent();
  console.log(
    `[content] services=${content.services.length}, levels=${content.englishLevels.length}, faq=${content.faqItems.length}`,
  );
  console.log('[content.level.ids]', content.englishLevels.map((x) => x.id));

  const bot = new TelegramBot(token, { polling: true });

  async function notifyManager(html) {
    const mid = process.env.MANAGER_CHAT_ID;
    if (!mid) {
      console.warn('[bot] MANAGER_CHAT_ID не задан — уведомление не отправлено');
      return;
    }
    await bot.sendMessage(mid, html, { parse_mode: 'HTML' });
  }

  async function sendBookingSummary(chatId, draft, messageIdToEdit) {
    const text =
      `Проверьте данные:\n\n` +
      `Имя: ${draft.name}\n` +
      `Контакт: ${draft.contact}\n` +
      `Услуга: ${draft.serviceTitle}\n` +
      `Уровень: ${draft.levelLabel}\n` +
      `Цель: ${draft.goal}\n` +
      `Время: ${draft.preferredTime}\n` +
      `Комментарий: ${draft.comment || '—'}\n`;

    const opts = { reply_markup: confirmKeyboard() };
    if (messageIdToEdit) {
      try {
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageIdToEdit, ...opts });
        return;
      } catch {
        /* fallback */
      }
    }
    await bot.sendMessage(chatId, text, opts);
  }

  async function safeEditOrSend(chatId, messageId, text, options = {}) {
    if (messageId) {
      try {
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...options });
        return;
      } catch (e) {
        console.warn('[telegram.editMessageText]', e?.message || e);
      }
    }
    await bot.sendMessage(chatId, text, options);
  }

  async function startBookingFlow(chatId, session) {
    session.draft = emptyDraft();
    session.state = States.BOOK_SERVICE;
    session.editingSubmissionId = null;
    session.resumeToConfirm = false;
    await bot.sendMessage(chatId, ui('prompt_choose_service', 'Выбери услугу...'), {
      reply_markup: servicesKeyboard(),
    });
  }

  bot.onText(/\/start|\/menu/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    await clearAiContext(userId);
    await withBookingSession(userId, { chatId, username: msg.from.username }, async (session) => {
      applyMainMenu(session);
    });
    try {
      const photoPath = getValidStartPhotoPath();
      if (photoPath) {
        await bot.sendPhoto(chatId, photoPath, {
          caption: getContent().intro,
          reply_markup: mainReplyKeyboard(),
        });
      } else {
        await bot.sendMessage(chatId, getContent().intro, { reply_markup: mainReplyKeyboard() });
      }
    } catch (e) {
      console.warn('[start.photo]', e?.message || e);
      await bot.sendMessage(chatId, getContent().intro, { reply_markup: mainReplyKeyboard() });
    }
  });

  bot.onText(/\/cancel/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    await clearAiContext(userId);
    await withBookingSession(userId, { chatId, username: msg.from.username }, async (session) => {
      applyMainMenu(session);
    });
    await bot.sendMessage(chatId, 'Сценарий сброшен.', { reply_markup: mainReplyKeyboard() });
  });

  bot.on('callback_query', async (q) => {
    const userId = q.from.id;
    const chatId = q.message?.chat?.id;
    const msgId = q.message?.message_id;
    const data = q.data;
    if (!data || !chatId) {
      await bot.answerCallbackQuery(q.id);
      return;
    }

    await bot.answerCallbackQuery(q.id);

    try {
      await withBookingSession(userId, { chatId, username: q.from.username }, async (session) => {
      console.log('[callback]', { userId, data, state: session.state });
      if (data === 'nav:main') {
        applyMainMenu(session);
        await bot.sendMessage(chatId, 'Главное меню:', { reply_markup: mainReplyKeyboard() });
        return;
      }

      if (data === 'nav:my_req') {
        session.state = States.MY_REQUESTS_LIST;
        await bot.sendMessage(chatId, 'Ваши активные заявки (Supabase):', {
          reply_markup: await myRequestsKeyboard(userId),
        });
        return;
      }

      if (data.startsWith('faq:')) {
        const id = data.slice(4);
        const item = getContent().faqItems.find((f) => f.id === id);
        if (item) {
          await bot.sendMessage(chatId, `<b>${escapeHtml(item.question)}</b>\n\n${escapeHtml(item.answer)}`, {
            parse_mode: 'HTML',
            reply_markup: faqKeyboard(),
          });
        }
        return;
      }

      if (data.startsWith('req:open:')) {
        const sid = data.slice(9);
        const sub = await findSubmission(userId, sid);
        if (!sub) {
          await bot.sendMessage(chatId, 'Заявка не найдена.');
          return;
        }
        session.state = States.MY_REQUEST_ACTION;
        await bot.sendMessage(
          chatId,
          `Заявка ${formatDateRu(sub.createdAt)}\n` +
            `Услуга: ${sub.serviceTitle}\nСтатус: ${sub.status}`,
          { reply_markup: requestActionKeyboard(sid) },
        );
        return;
      }

      if (data.startsWith('req:cancel:')) {
        const sid = data.slice(11);
        const sub = await findSubmission(userId, sid);
        if (!sub || sub.status !== 'active') {
          await bot.sendMessage(chatId, 'Нельзя отменить эту заявку.');
          return;
        }
        await markCancelled(userId, sid);
        await notifyManager(
          `<b>Отмена заявки</b>\nПользователь: ${userId} @${q.from.username || '—'}\n` +
            `ID: ${sid}\nУслуга: ${escapeHtml(sub.serviceTitle)}\nИмя: ${escapeHtml(sub.name)}`,
        );
        await bot.sendMessage(chatId, 'Заявка отменена. Менеджер уведомлён.', {
          reply_markup: mainReplyKeyboard(),
        });
        applyMainMenu(session);
        return;
      }

      if (data.startsWith('req:edit:')) {
        const sid = data.slice(9);
        const sub = await findSubmission(userId, sid);
        if (!sub || sub.status !== 'active') {
          await bot.sendMessage(chatId, 'Нельзя изменить эту заявку.');
          return;
        }
        session.draft = draftFromSubmission(sub);
        session.editingSubmissionId = sid;
        session.state = States.BOOK_CONFIRM;
        await sendBookingSummary(chatId, session.draft);
        return;
      }

      if (!data.startsWith('book:')) return;

      const draft = session.draft;
      const services = getContent().services;
      const levels = getContent().englishLevels;
      const presets = getContent().timePresets;

      if (data.startsWith('book:svc:')) {
        const id = data.slice(9);
        const svc = services.find((x) => normId(x.id) === normId(id));
        if (!svc) {
          console.warn('[booking.service.not_found]', {
            incoming: id,
            available: services.map((x) => x.id),
          });
          await bot.sendMessage(chatId, 'Не удалось выбрать услугу. Нажми «Записаться на урок» и попробуй ещё раз.');
          return;
        }
        draft.serviceId = svc.id;
        draft.serviceTitle = `${svc.title} (${svc.duration}, ${svc.price})`;
        if (session.resumeToConfirm) {
          session.resumeToConfirm = false;
          session.state = States.BOOK_CONFIRM;
          await sendBookingSummary(chatId, draft, msgId);
          return;
        }
        session.state = States.BOOK_NAME;
        await safeEditOrSend(chatId, msgId, `Услуга: ${draft.serviceTitle}\n\n${ui('prompt_name', 'Как тебя зовут? Напиши имя текстом.')}`);
        return;
      }

      if (data.startsWith('book:lv:')) {
        const id = data.slice('book:lv:'.length);
        const lv = levels.find((x) => normId(x.id) === normId(id));
        if (normId(id) === 'skip') {
          draft.levelId = null;
          draft.levelLabel = 'Пока не знаю / обсудим на пробном';
          console.log('[booking.level.skipped]', { userId });
        } else if (!lv) {
          // Для пробного уровень не блокирует сценарий.
          draft.levelId = id || null;
          draft.levelLabel = 'Не указан';
          console.warn('[booking.level.not_found.continue]', {
            incoming: id,
            available: levels.map((x) => x.id),
          });
        } else {
          draft.levelId = lv.id;
          draft.levelLabel = lv.label;
          console.log('[booking.level.selected]', { userId, levelId: lv.id, levelLabel: lv.label });
        }
        if (session.resumeToConfirm) {
          session.resumeToConfirm = false;
          session.state = States.BOOK_CONFIRM;
          await sendBookingSummary(chatId, draft, msgId);
          return;
        }
        session.state = States.BOOK_GOAL;
        // На некоторых клиентах редактирование сообщения с inline-клавиатурой глючит.
        // На шаге уровня всегда отправляем новое сообщение, чтобы пользователь не "зависал".
        await bot.sendMessage(chatId, ui('prompt_goal', 'Напиши одним сообщением, для чего тебе нужен английский.'));
        return;
      }

      if (data.startsWith('book:tm:')) {
        const id = data.slice('book:tm:'.length);
        if (id === 'custom') {
          draft.preferredTime = null;
          session.state = States.BOOK_TIME;
          await safeEditOrSend(chatId, msgId, ui('prompt_time_custom', 'Напиши дату и время текстом.'));
          return;
        }
        const tm = presets.find((x) => normId(x.id) === normId(id));
        if (!tm) {
          console.warn('[booking.time.not_found]', {
            incoming: id,
            available: presets.map((x) => x.id),
          });
          await bot.sendMessage(chatId, 'Не удалось определить выбранное время. Попробуйте выбрать ещё раз.');
          return;
        }
        draft.preferredTime = tm.label;
        if (session.resumeToConfirm) {
          session.resumeToConfirm = false;
          session.state = States.BOOK_CONFIRM;
          await sendBookingSummary(chatId, draft, msgId);
          return;
        }
        session.state = States.BOOK_COMMENT;
        await safeEditOrSend(
          chatId,
          msgId,
          ui('prompt_comment', 'Можешь оставить комментарий — я передам его преподавателю. Отправь текстом или нажми «Пропустить комментарий».'),
          { reply_markup: commentKeyboard() },
        );
        return;
      }

      if (data === 'book:skip_comment') {
        draft.comment = '';
        if (session.resumeToConfirm) session.resumeToConfirm = false;
        session.state = States.BOOK_CONFIRM;
        await sendBookingSummary(chatId, draft);
        return;
      }

      if (data === 'book:confirm_yes') {
        if (
          !draft.name ||
          !draft.contact ||
          !draft.serviceTitle ||
          !draft.goal ||
          !draft.preferredTime
        ) {
          await bot.sendMessage(chatId, `Данных пока недостаточно. Начни запись заново: «${ui('menu_book', 'Записаться на урок')}».`);
          applyMainMenu(session);
          return;
        }

        const dateStr = new Date().toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

        const sheetResult = await appendApplicationRow({
          name: draft.name,
          contact: draft.contact,
          levelLabel: draft.levelLabel || 'Не указан',
          goal: draft.goal,
          preferredTime: draft.preferredTime,
          comment: draft.comment || '',
          dateStr,
        });
        console.log('[sheets.submit]', sheetResult);

        const replacedId = session.editingSubmissionId;

        const sub = await insertApplication(userId, {
          serviceId: draft.serviceId,
          serviceTitle: draft.serviceTitle,
          name: draft.name,
          contact: draft.contact,
          levelId: draft.levelId,
          levelLabel: draft.levelLabel,
          goal: draft.goal,
          preferredTime: draft.preferredTime,
          comment: draft.comment || '',
          sheetOk: sheetResult.ok,
          meta: { sheet_synced: sheetResult.ok, replaced_application_id: replacedId || null },
        });

        if (replacedId) {
          await markCancelled(userId, replacedId);
          session.editingSubmissionId = null;
        }

        await notifyManager(
          `<b>Новая заявка</b>\n` +
            (replacedId ? `<b>Замена</b> заявки <code>${replacedId}</code>\n` : '') +
            `User: <code>${userId}</code> @${q.from.username || '—'}\n` +
            `Имя: ${escapeHtml(draft.name)}\n` +
            `Контакт: ${escapeHtml(draft.contact)}\n` +
            `Услуга: ${escapeHtml(draft.serviceTitle)}\n` +
            `Уровень: ${escapeHtml(draft.levelLabel)}\n` +
            `Цель: ${escapeHtml(draft.goal)}\n` +
            `Время: ${escapeHtml(draft.preferredTime)}\n` +
            `Комментарий: ${escapeHtml(draft.comment || '—')}\n` +
            `Дата заявки: ${escapeHtml(dateStr)}\n` +
            `Sheets: ${sheetResult.ok ? 'OK' : 'ошибка / не настроено'}\n` +
            `ID в БД: <code>${sub.id}</code>`,
        );

        applyMainMenu(session);
        await bot.sendMessage(
          chatId,
          sheetResult.ok
            ? ui('success_submit', 'Спасибо! Я передам твою заявку преподавателю. Она свяжется с тобой в ближайшее время.')
            : ui('error_submit', 'Не удалось сохранить заявку. Пожалуйста, попробуй еще раз позже.'),
          { reply_markup: mainReplyKeyboard() },
        );

        try {
          await bot.deleteMessage(chatId, msgId);
        } catch {
          /* ignore */
        }
        return;
      }

      if (data === 'book:confirm_edit') {
        session.state = States.BOOK_EDIT_MENU;
        await safeEditOrSend(chatId, msgId, 'Что изменить?', { reply_markup: editFieldKeyboard() });
        return;
      }

      if (data === 'book:edit_back') {
        session.state = States.BOOK_CONFIRM;
        await sendBookingSummary(chatId, draft, msgId);
        return;
      }

      if (data.startsWith('book:edit:')) {
        const field = data.slice(10);
        session.resumeToConfirm = true;
        if (field === 'service') {
          session.state = States.BOOK_SERVICE;
          await bot.sendMessage(chatId, 'Выберите услугу:', { reply_markup: servicesKeyboard() });
          return;
        }
        if (field === 'name') {
          session.state = States.BOOK_NAME;
          await bot.sendMessage(chatId, ui('prompt_name', 'Как тебя зовут? Напиши имя текстом.'));
          return;
        }
        if (field === 'contact') {
          session.state = States.BOOK_CONTACT;
          await bot.sendMessage(chatId, ui('prompt_contact', 'Укажи номер телефона или @username в Telegram.'));
          return;
        }
        if (field === 'level') {
          session.state = States.BOOK_LEVEL;
          await bot.sendMessage(chatId, ui('prompt_level', 'Выбери свой уровень английского. Для пробного занятия это необязательно.'), { reply_markup: levelsKeyboard() });
          return;
        }
        if (field === 'goal') {
          session.state = States.BOOK_GOAL;
          await bot.sendMessage(chatId, ui('prompt_goal', 'Напиши одним сообщением, для чего тебе нужен английский.'));
          return;
        }
        if (field === 'time') {
          session.state = States.BOOK_TIME;
          await bot.sendMessage(chatId, ui('prompt_time', 'Когда тебе удобно? Выбери вариант ниже или нажми «Напишу текстом».'), {
            reply_markup: timeKeyboard(),
          });
          return;
        }
        if (field === 'comment') {
          session.state = States.BOOK_COMMENT;
          await bot.sendMessage(chatId, 'Новый комментарий:', {
            reply_markup: commentKeyboard(),
          });
        }
      }
    });
    } catch (e) {
      console.error('[callback_query]', e);
      await bot.sendMessage(
        chatId,
        'Не удалось обработать нажатие. Проверьте настройки Supabase key и повторите /start.',
      );
    }
  });

  bot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return;

    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const username = msg.from.username;

    try {
      await withBookingSession(userId, { chatId, username }, async (session) => {
      const { state, draft } = session;
      const knownButtonTexts = new Set([
        ui('menu_book', 'Записаться на урок'),
        ui('menu_faq', 'Ответы на частые вопросы'),
        ui('menu_channel', 'Канал Даши'),
        ui('menu_contact', 'Связаться с преподавателем'),
        ui('menu_requests', 'Мои заявки'),
      ]);
      const trimmed = normalizeText(text);
      const isBookingState = String(state).startsWith('BOOK_');

      // Быстрый путь для анкеты: короткие корректные ответы не отправляем в LLM.
      let skipAiForFastBookingInput = false;
      if (isBookingState && trimmed) {
        if (state === States.BOOK_NAME && isLikelyName(trimmed)) skipAiForFastBookingInput = true;
        if (state === States.BOOK_CONTACT && isLikelyContact(trimmed)) skipAiForFastBookingInput = true;
        if (state === States.BOOK_GOAL && trimmed.length >= 3) skipAiForFastBookingInput = true;
        if (state === States.BOOK_TIME && trimmed.length >= 2) skipAiForFastBookingInput = true;
        if (state === States.BOOK_COMMENT) skipAiForFastBookingInput = true;
      }

      // Если пользователь в анкете повторяет предыдущий короткий ответ, отдаем в AI (возможная смена темы/уточнение).
      if (isBookingState && trimmed) {
        if (state === States.BOOK_NAME && draft.name && normId(draft.name) === normId(trimmed)) {
          skipAiForFastBookingInput = false;
        }
        if (state === States.BOOK_CONTACT && draft.contact && normId(draft.contact) === normId(trimmed)) {
          skipAiForFastBookingInput = false;
        }
      }

      // Если в анкете есть явные маркеры смены темы — не пропускаем AI.
      if (isBookingState && looksLikeTopicSwitch(trimmed)) {
        skipAiForFastBookingInput = false;
      }

      const shouldRunAi =
        Boolean(process.env.OPENAI_API_KEY?.trim()) &&
        !knownButtonTexts.has(text || '') &&
        !skipAiForFastBookingInput;

      let ai = null;
      if (shouldRunAi && text) {
        await bot.sendChatAction(chatId, 'typing');
        ai = await getAiIntentReply(text, {
          content: getContent(),
          channelUrl: getChannelUrl(),
          sessionState: state,
          draft,
        });
      }

      // Новое правило: на каждом сообщении сначала проверяем LLM на смену темы.
      if (ai && state !== States.MAIN_MENU) {
        const canContinueBooking = ai.intent === 'booking_continue' || ai.intent === 'booking_request';
        const isSameTeacherFlow = state === States.CONTACT_TEACHER && ai.intent === 'contact_request';
        if ((isBookingState && (!canContinueBooking || ai.is_topic_switch || ai.is_gibberish)) ||
            (state === States.CONTACT_TEACHER && !isSameTeacherFlow && (ai.is_topic_switch || ai.intent !== 'booking_continue'))) {
          applyMainMenu(session);
          await bot.sendMessage(chatId, ai.reply, { reply_markup: mainReplyKeyboard() });
          if (ai.intent === 'booking_request' || ai.intent === 'booking_continue') {
            await startBookingFlow(chatId, session);
            return;
          }
          if (ai.intent === 'reschedule_or_cancel') {
            session.state = States.MY_REQUESTS_LIST;
            await bot.sendMessage(chatId, 'Показываю ваши заявки для изменения/отмены:', {
              reply_markup: await myRequestsKeyboard(userId),
            });
            return;
          }
          if (ai.intent === 'contact_request') {
            session.state = States.CONTACT_TEACHER;
            await bot.sendMessage(
              chatId,
              'Напишите одним сообщением, что нужно передать преподавателю. Для отмены — /cancel.',
              { reply_markup: removeKeyboard() },
            );
            return;
          }
          return;
        }
      }

      if (state === States.MAIN_MENU && text) {
        if (text === ui('menu_book', 'Записаться на урок') || text === 'Записаться на пробное') {
          await startBookingFlow(chatId, session);
          return;
        }
        if (text === ui('menu_faq', 'Ответы на частые вопросы')) {
          await bot.sendMessage(
            chatId,
            ui('prompt_faq', 'Выбери вопрос или напиши его одним сообщением. Я постараюсь помочь.'),
            { reply_markup: faqKeyboard() },
          );
          return;
        }
        if (text === ui('menu_channel', 'Канал Даши')) {
          await bot.sendMessage(chatId, `${ui('menu_channel', 'Канал Даши')}:\n${getChannelUrl()}`);
          return;
        }
        if (text === ui('menu_contact', 'Связаться с преподавателем')) {
          session.state = States.CONTACT_TEACHER;
          await bot.sendMessage(chatId, ui('prompt_contact_teacher', 'Что мне передать Дарье?'), { reply_markup: removeKeyboard() });
          return;
        }
        if (text === ui('menu_requests', 'Мои заявки')) {
          session.state = States.MY_REQUESTS_LIST;
          await bot.sendMessage(chatId, 'Активные заявки:', {
            reply_markup: await myRequestsKeyboard(userId),
          });
          return;
        }
        if (ai) {
          await bot.sendMessage(chatId, ai.reply, { reply_markup: mainReplyKeyboard() });
          if (ai.intent === 'booking_request' || ai.intent === 'booking_continue') {
            await startBookingFlow(chatId, session);
            return;
          }
          if (ai.intent === 'reschedule_or_cancel') {
            session.state = States.MY_REQUESTS_LIST;
            await bot.sendMessage(chatId, 'Показываю ваши заявки для изменения/отмены:', {
              reply_markup: await myRequestsKeyboard(userId),
            });
            return;
          }
          if (ai.intent === 'contact_request') {
            session.state = States.CONTACT_TEACHER;
            await bot.sendMessage(
              chatId,
              'Напишите одним сообщением, что нужно передать преподавателю. Для отмены — /cancel.',
              { reply_markup: removeKeyboard() },
            );
            return;
          }
          return;
        }

        if (!ai) {
          await bot.sendMessage(
            chatId,
            'Я пока отвечаю только по кнопкам меню. Выберите нужный пункт или напишите преподавателю.',
            { reply_markup: mainReplyKeyboard() },
          );
          return;
        }
        return;
      }

      if (state === States.CONTACT_TEACHER && text) {
        await notifyManager(
          `<b>Сообщение преподавателю</b>\nОт: <code>${userId}</code> @${msg.from.username || '—'}\n\n${escapeHtml(text)}`,
        );
        applyMainMenu(session);
        await bot.sendMessage(chatId, 'Сообщение отправлено.', { reply_markup: mainReplyKeyboard() });
        return;
      }

      if (state === States.BOOK_NAME && text) {
        draft.name = text;
        if (session.resumeToConfirm) {
          session.resumeToConfirm = false;
          session.state = States.BOOK_CONFIRM;
          await sendBookingSummary(chatId, draft);
        } else {
          session.state = States.BOOK_CONTACT;
          await bot.sendMessage(chatId, ui('prompt_contact', 'Укажи номер телефона или @username в Telegram.'));
        }
        return;
      }

      if (state === States.BOOK_CONTACT && text) {
        draft.contact = text;
        if (session.resumeToConfirm) {
          session.resumeToConfirm = false;
          session.state = States.BOOK_CONFIRM;
          await sendBookingSummary(chatId, draft);
        } else {
          session.state = States.BOOK_LEVEL;
          await bot.sendMessage(
            chatId,
            ui('prompt_level', 'Выбери свой уровень английского. Для пробного занятия это необязательно.'),
            { reply_markup: levelsKeyboard() },
          );
        }
        return;
      }

      if (state === States.BOOK_GOAL && text) {
        draft.goal = text;
        if (session.resumeToConfirm) {
          session.resumeToConfirm = false;
          session.state = States.BOOK_CONFIRM;
          await sendBookingSummary(chatId, draft);
        } else {
          session.state = States.BOOK_TIME;
          await bot.sendMessage(chatId, ui('prompt_time', 'Когда тебе удобно? Выбери вариант ниже или нажми «Напишу текстом».'), {
            reply_markup: timeKeyboard(),
          });
        }
        return;
      }

      if (state === States.BOOK_TIME && text) {
        draft.preferredTime = text;
        if (session.resumeToConfirm) {
          session.resumeToConfirm = false;
          session.state = States.BOOK_CONFIRM;
          await sendBookingSummary(chatId, draft);
        } else {
          session.state = States.BOOK_COMMENT;
          await bot.sendMessage(
            chatId,
            ui('prompt_comment', 'Можешь оставить комментарий — я передам его преподавателю. Отправь текстом или нажми «Пропустить комментарий».'),
            { reply_markup: commentKeyboard() },
          );
        }
        return;
      }

      if (state === States.BOOK_COMMENT && text) {
        draft.comment = text === '-' ? '' : text;
        if (session.resumeToConfirm) session.resumeToConfirm = false;
        session.state = States.BOOK_CONFIRM;
        await sendBookingSummary(chatId, draft);
      }
    });
    } catch (e) {
      console.error('[message]', e);
      await bot.sendMessage(
        chatId,
        'Произошла техническая ошибка. Попробуйте ещё раз или начните заново командой /start.',
      );
    }
  });

  bot.on('polling_error', (err) => {
    console.error('[polling]', err.message);
  });

  console.log('Бот запущен. Ctrl+C — остановка.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
