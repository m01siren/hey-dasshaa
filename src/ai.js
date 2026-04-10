const ALLOWED_INTENTS = new Set([
  'faq_question',
  'booking_request',
  'booking_continue',
  'reschedule_or_cancel',
  'contact_request',
  'off_topic',
  'unclear',
]);

const INTENT_ALIASES = {
  faq: 'faq_question',
  question: 'faq_question',
  info: 'faq_question',
  general_question: 'faq_question',
  booking: 'booking_request',
  sign_up: 'booking_request',
  cancel: 'reschedule_or_cancel',
  reschedule: 'reschedule_or_cancel',
  contact: 'contact_request',
  teacher: 'contact_request',
  unrelated: 'off_topic',
  other: 'off_topic',
  unknown: 'unclear',
  ambiguous: 'unclear',
};

function normalizeIntent(raw) {
  const k = String(raw || '')
    .toLowerCase()
    .trim();
  if (ALLOWED_INTENTS.has(k)) return k;
  return INTENT_ALIASES[k] || '';
}

function buildSystemPrompt() {
  return `Ты — дружелюбный AI-ассистент Telegram-бота частного репетитора по английскому языку.

Твоя роль:
- помогать пользователю по вопросам занятий;
- распознавать намерение пользователя;
- отвечать на вопросы по FAQ и данным о занятиях;
- помогать с записью на пробное занятие;
- не придумывать факты;
- говорить коротко, понятно и по-человечески.

## Главный принцип
Сначала пойми, что именно хочет пользователь в текущем сообщении.
Не продолжай предыдущий сценарий автоматически, если пользователь сменил тему, задал новый вопрос или написал что-то непонятное.

## О чем ты можешь говорить
Ты отвечаешь только по темам, связанным с данным ботом:
- запись на пробное занятие;
- индивидуальные занятия;
- групповые занятия;
- формат обучения;
- запись;
- перенос или отмена заявки;
- вопросы по FAQ;
- связь с преподавателем;
- ссылка на Telegram-канал преподавателя.

## О чем ты НЕ должен говорить
Не отвечай на вопросы:
- с советами по изучению английского;
- с объяснением грамматики;
- с переводами;
- с выполнением упражнений;
- на посторонние темы, не связанные с занятиями и записью.

На такие сообщения intent = off_topic, вежливо ответь, что бот помогает только по занятиям, записи и формату (без перевода и разбора грамматики).

## Вопросы про формат, группы, цены, расписание
Если ответ есть в BOT_CONTEXT (услуги, уровни, пресеты времени) или в FAQ_CONTEXT — intent = faq_question, дай конкретный короткий ответ по этим данным.
Если в данных нет точного ответа — faq_question и честно скажи, что лучше уточнить у преподавателя; не предлагай только «нажми кнопку FAQ» вместо ответа.

## Как определять смысл сообщения
Для каждого нового сообщения:
1. Определи, это новый вопрос, продолжение записи, смена темы, отказ, уточнение или бессмысленное сообщение.
2. Если пользователь уже в сценарии записи, проверь:
   - он отвечает на текущий вопрос;
   - он дал сразу несколько данных;
   - он сменил тему;
   - он написал непонятный текст.
3. Если пользователь сменил тему, не продолжай старый шаг формы.
4. Если пользователь написал новый осмысленный вопрос, ответь на него.
5. Если сообщение непонятное или бессмысленное, попроси уточнить.

## Намерения, которые нужно распознавать
- faq_question
- booking_request
- booking_continue
- reschedule_or_cancel
- contact_request
- off_topic
- unclear

## Правила для записи
Если пользователь хочет записаться:
- извлеки из его сообщения все данные, которые он уже сообщил;
- не проси повторно то, что уже понятно из текста;
- запрашивай только недостающие данные;
- если пользователь одной фразой сообщил несколько параметров, учти их все;
- если данные распознаны не до конца точно, не утверждай их как факт, а мягко уточни.

Примеры данных, которые можно извлекать:
- service
- lesson_format
- preferred_time
- name
- phone
- telegram_username
- english_level
- learning_goal

## Очень важные ограничения
- Используй только данные из предоставленного контекста и FAQ.
- Не додумывай цены, скидки, расписание, правила переноса, платформу занятий и другие детали, если их нет в данных.
- Не используй фразы вроде: “обычно”, “скорее всего”, “как правило”, если это не подтверждено контекстом.
- Если точного ответа нет, честно скажи об этом.
- Лучше признать, что информации нет, чем дать красивый, но выдуманный ответ.

## Как отвечать
- Кратко: обычно 1–3 предложения.
- Дружелюбно, спокойно, без канцелярита.
- На русском языке.
- Без сухих шаблонов и без “роботизированных” фраз.
- Не повторяй одно и то же.
- Не перечисляй внутреннюю логику.
- Не говори, что ты “анализируешь интент” или “находишься в сценарии”.

## Если вопрос не по теме
Отвечай вежливо, например:
“Я помогаю только по вопросам занятий, записи и формата обучения. Если хотите, могу помочь записаться на пробное занятие или ответить на вопрос о занятиях.”

## Если ответа нет в данных
Отвечай честно, например:
“У меня сейчас нет точной информации по этому вопросу. Лучше уточнить это у преподавателя.”

## Если сообщение непонятное
Отвечай мягко, например:
“Не совсем понял ваш вопрос. Можете написать чуть подробнее?”

## Если пользователь сменил тему во время записи
Не продолжай форму автоматически.
Сначала ответь на новое сообщение по смыслу.
Если уместно, после ответа можно коротко напомнить, что запись можно продолжить.

## Стиль хорошего ответа
Хороший ответ:
- звучит естественно;
- учитывает последнее сообщение пользователя;
- не игнорирует смену темы;
- не выдумывает факты;
- не задает лишние вопросы;
- просит только то, чего реально не хватает.

## Формат результата
Верни строго JSON без пояснений:
{
  "intent": "...",
  "is_topic_switch": true/false,
  "is_gibberish": true/false,
  "extracted_fields": {
    "service": {"value": "...", "confidence": "high|medium|low"},
    "preferred_time": {"value": "...", "confidence": "high|medium|low"}
  },
  "missing_fields": ["..."],
  "reply": "..."
}`;
}

function buildBotContext(content, channelUrl, runtime = {}) {
  const services = content.services.map((s) => `${s.title} (${s.duration}, ${s.price})`).join('; ');
  const levels = content.englishLevels.map((l) => l.label).join('; ');
  const times = content.timePresets.map((t) => t.label).join('; ');
  return [
    `intro: ${content.intro}`,
    `services: ${services || 'нет данных'}`,
    `english_levels: ${levels || 'нет данных'}`,
    `time_presets: ${times || 'нет данных'}`,
    `channel_url: ${channelUrl || 'не задан'}`,
    'bot_actions: запись на пробное, отмена/изменение заявки, передача сообщения преподавателю, просмотр FAQ, выдача ссылки на канал',
    `current_state: ${runtime.sessionState || 'UNKNOWN'}`,
    `current_draft: ${JSON.stringify(runtime.draft || {})}`,
  ].join('\n');
}

function buildFaqContext(content) {
  return content.faqItems.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseModelOutput(raw) {
  const text = String(raw || '').trim();
  const parsedDirect = safeJsonParse(text);
  const parsedFromFence = (() => {
    const m = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
    return m ? safeJsonParse(m[1].trim()) : null;
  })();
  const data = parsedDirect || parsedFromFence;
  if (!data || typeof data !== 'object') return null;

  const intent = normalizeIntent(data.intent);
  const reply = typeof data.reply === 'string' ? data.reply.trim() : '';
  if (!intent || !reply) return null;

  return {
    intent,
    is_topic_switch: Boolean(data.is_topic_switch),
    is_gibberish: Boolean(data.is_gibberish),
    extracted_fields: data.extracted_fields && typeof data.extracted_fields === 'object' ? data.extracted_fields : {},
    missing_fields: Array.isArray(data.missing_fields) ? data.missing_fields : [],
    reply,
  };
}

function findFaqAnswer(userLower, faqItems) {
  if (!faqItems?.length) return null;
  const t = userLower.replace(/[?!.,;:]+/g, ' ').trim();
  for (const item of faqItems) {
    const q = String(item.question || '').toLowerCase();
    if (!q) continue;
    if (t.includes(q.slice(0, Math.min(12, q.length))) || q.split(/\s+/).filter((w) => w.length > 3 && t.includes(w)).length >= 2) {
      return String(item.answer || '').trim();
    }
  }
  return null;
}

function groupFormatReply(content) {
  const services = content?.services || [];
  const groupish = services.filter((s) => /групп|мини|клуб|разговор/i.test(String(s.title || '')));
  if (groupish.length) {
    const line = groupish.map((s) => `${s.title} (${s.duration}, ${s.price})`).join('; ');
    return `В каталоге есть формат для небольших групп: ${line}. Подробности и набор — у преподавателя, можно написать через «Связаться с преподавателем».`;
  }
  return 'По групповым форматам у меня нет точной строки в данных. Напишите преподавателю через «Связаться с преподавателем» — она подскажет, есть ли набор в группу.';
}

function heuristicIntentReply(userText, content) {
  const t = String(userText || '').toLowerCase();
  const has = (arr) => arr.some((x) => t.includes(x));

  if (has(['переведи', 'перевод', 'translate', 'translation', 'how do you say', 'что значит ', 'переводчик'])) {
    return {
      intent: 'off_topic',
      is_topic_switch: true,
      is_gibberish: false,
      extracted_fields: {},
      missing_fields: [],
      reply:
        'Я помогаю по записи на занятия, формату и вопросам из раздела про уроки. Переводы и разбор фраз здесь не делаю — лучше спросить у преподавателя или воспользоваться переводчиком.',
    };
  }
  if (has(['грамматик', 'спряжен', 'артикль', 'времена в англий', 'упражнен', 'как правильно сказать'])) {
    return {
      intent: 'off_topic',
      is_topic_switch: true,
      is_gibberish: false,
      extracted_fields: {},
      missing_fields: [],
      reply:
        'Разбор грамматики и упражнения здесь не делаю — я про запись и организацию занятий. Могу ответить по формату уроков или помочь оставить заявку.',
    };
  }

  if (has(['запис', 'пробн', 'оставить заявку', 'хочу на урок', 'хочу занят'])) {
    return {
      intent: 'booking_request',
      is_topic_switch: false,
      is_gibberish: false,
      extracted_fields: {},
      missing_fields: [],
      reply: 'Отлично, помогу записаться. Нажмите «Записаться на урок» в меню ниже — откроется анкета.',
    };
  }
  if (has(['перенес', 'перенести', 'отмен', 'изменить заявку', 'изменить запись'])) {
    return {
      intent: 'reschedule_or_cancel',
      is_topic_switch: true,
      is_gibberish: false,
      extracted_fields: {},
      missing_fields: [],
      reply: 'Понял(а). Помогу с переносом или отменой. Открою ваши заявки для изменения.',
    };
  }
  if (has(['связ', 'контакт', 'написать преподавателю', 'сообщение преподавателю'])) {
    return {
      intent: 'contact_request',
      is_topic_switch: true,
      is_gibberish: false,
      extracted_fields: {},
      missing_fields: [],
      reply: 'Хорошо, помогу передать сообщение преподавателю.',
    };
  }

  if (has(['групп', 'в групп', 'мини-групп', 'коллективн', 'вместе с другими'])) {
    return {
      intent: 'faq_question',
      is_topic_switch: true,
      is_gibberish: false,
      extracted_fields: {},
      missing_fields: [],
      reply: groupFormatReply(content),
    };
  }

  const faqHit = findFaqAnswer(t, content?.faqItems);
  if (faqHit) {
    return {
      intent: 'faq_question',
      is_topic_switch: true,
      is_gibberish: false,
      extracted_fields: {},
      missing_fields: [],
      reply: faqHit,
    };
  }

  if (has(['цена', 'стоим', 'сколько стоит', 'формат', 'длитель', 'урок', 'заняти', 'канал', 'онлайн', 'zoom', 'meet'])) {
    const services = content?.services?.length
      ? content.services.map((s) => `• ${s.title} (${s.duration}, ${s.price})`).join('\n')
      : '';
    const extra = services ? `\n\nУслуги:\n${services}` : '';
    return {
      intent: 'faq_question',
      is_topic_switch: true,
      is_gibberish: false,
      extracted_fields: {},
      missing_fields: [],
      reply:
        `Кратко: услуги и цены — в меню «Записаться на урок», типовые вопросы — «Ответы на частые вопросы», ссылка на канал — кнопка «Канал Даши».${extra}`,
    };
  }

  if (t.replace(/[a-zа-я0-9\s]/gi, '').length > Math.max(3, t.length / 2) || t.trim().length < 2) {
    return {
      intent: 'unclear',
      is_topic_switch: true,
      is_gibberish: true,
      extracted_fields: {},
      missing_fields: [],
      reply: 'Не совсем понял ваш запрос. Можете написать чуть подробнее?',
    };
  }

  if (/[a-z]{3,}/i.test(userText || '') && !/[а-яё]{2,}/i.test(userText || '')) {
    return {
      intent: 'off_topic',
      is_topic_switch: true,
      is_gibberish: false,
      extracted_fields: {},
      missing_fields: [],
      reply:
        'Пишу по-русски и помогаю по занятиям и записи. Если это был вопрос по урокам — перефразируйте по-русски; переводы и разбор английских фраз здесь не делаю.',
    };
  }

  return {
    intent: 'unclear',
    is_topic_switch: true,
    is_gibberish: false,
    extracted_fields: {},
    missing_fields: [],
    reply:
      'Могу помочь с записью на урок, ответами из частых вопросов или сообщением преподавателю — выберите пункт в меню ниже или опишите вопрос одним сообщением по-русски.',
  };
}

export async function getAiIntentReply(userText, { content, channelUrl, sessionState, draft }) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return heuristicIntentReply(userText, content);

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const intentEnum = [...ALLOWED_INTENTS];
  const schema = {
    name: 'bot_intent_response',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        intent: { type: 'string', enum: intentEnum },
        is_topic_switch: { type: 'boolean' },
        is_gibberish: { type: 'boolean' },
        extracted_fields: { type: 'object', additionalProperties: true },
        missing_fields: { type: 'array', items: { type: 'string' } },
        reply: { type: 'string' },
      },
      required: ['intent', 'is_topic_switch', 'is_gibberish', 'extracted_fields', 'missing_fields', 'reply'],
    },
    strict: true,
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: 'json_schema', json_schema: schema },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        {
          role: 'user',
          content: `BOT_CONTEXT:\n${buildBotContext(content, channelUrl, { sessionState, draft })}\n\nFAQ_CONTEXT:\n${buildFaqContext(content)}`,
        },
        { role: 'user', content: `USER_MESSAGE:\n${userText}` },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[ai]', res.status, err);
    return heuristicIntentReply(userText, content);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  return parseModelOutput(raw) || heuristicIntentReply(userText, content);
}
