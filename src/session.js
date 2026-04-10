import { getSupabase } from './supabase.js';

export const States = {
  MAIN_MENU: 'MAIN_MENU',
  BOOK_SERVICE: 'BOOK_SERVICE',
  BOOK_NAME: 'BOOK_NAME',
  BOOK_CONTACT: 'BOOK_CONTACT',
  BOOK_LEVEL: 'BOOK_LEVEL',
  BOOK_GOAL: 'BOOK_GOAL',
  BOOK_TIME: 'BOOK_TIME',
  BOOK_COMMENT: 'BOOK_COMMENT',
  BOOK_CONFIRM: 'BOOK_CONFIRM',
  BOOK_EDIT_MENU: 'BOOK_EDIT_MENU',
  ASK_FREE_QUESTION: 'ASK_FREE_QUESTION',
  CONTACT_TEACHER: 'CONTACT_TEACHER',
  MY_REQUESTS_LIST: 'MY_REQUESTS_LIST',
  MY_REQUEST_ACTION: 'MY_REQUEST_ACTION',
};

export function emptyDraft() {
  return {
    serviceId: null,
    serviceTitle: null,
    name: null,
    contact: null,
    levelId: null,
    levelLabel: null,
    goal: null,
    preferredTime: null,
    comment: null,
  };
}

function defaultSession() {
  return {
    state: States.MAIN_MENU,
    draft: emptyDraft(),
    editingSubmissionId: null,
    resumeToConfirm: false,
  };
}

function rowToSession(row) {
  const draft = { ...emptyDraft(), ...(row.draft && typeof row.draft === 'object' ? row.draft : {}) };
  return {
    state: row.state || States.MAIN_MENU,
    draft,
    editingSubmissionId: row.editing_submission_id ?? null,
    resumeToConfirm: Boolean(row.resume_to_confirm),
  };
}

export async function upsertTelegramProfile(telegramUserId, chatId, username) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data: existing } = await sb.from('telegram_profiles').select('id').eq('id', telegramUserId).maybeSingle();
  if (!existing) {
    const { error } = await sb.from('telegram_profiles').insert({
      id: telegramUserId,
      chat_id: chatId,
      username: username ?? null,
      first_seen_at: now,
      last_seen_at: now,
    });
    if (error) throw error;
  } else {
    const { error } = await sb
      .from('telegram_profiles')
      .update({
        chat_id: chatId,
        username: username ?? null,
        last_seen_at: now,
      })
      .eq('id', telegramUserId);
    if (error) throw error;
  }
}

async function fetchBookingSessionRow(telegramUserId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('booking_sessions').select('*').eq('user_id', telegramUserId).maybeSingle();
  if (error) throw error;
  return data;
}

async function persistBookingSession(telegramUserId, session) {
  const sb = getSupabase();
  const { error } = await sb.from('booking_sessions').upsert(
    {
      user_id: telegramUserId,
      state: session.state,
      draft: session.draft,
      editing_submission_id: session.editingSubmissionId,
      resume_to_confirm: session.resumeToConfirm,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

/**
 * Загрузка профиля, выполнение fn(session), сохранение сессии записи.
 */
export async function withBookingSession(telegramUserId, { chatId, username }, fn) {
  await upsertTelegramProfile(telegramUserId, chatId, username);
  const row = await fetchBookingSessionRow(telegramUserId);
  const session = row ? rowToSession(row) : defaultSession();
  await fn(session);
  await persistBookingSession(telegramUserId, session);
}

export function mapApplicationRow(row) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    serviceId: row.service_id,
    serviceTitle: row.service_title,
    name: row.name,
    contact: row.contact,
    levelId: row.level_id,
    levelLabel: row.level_label,
    goal: row.goal,
    preferredTime: row.preferred_time,
    comment: row.comment,
    sheetOk: row.sheet_ok,
    meta: row.meta,
  };
}

export async function insertApplication(telegramUserId, payload) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('applications')
    .insert({
      telegram_user_id: telegramUserId,
      status: 'active',
      service_id: payload.serviceId,
      service_title: payload.serviceTitle,
      name: payload.name,
      contact: payload.contact,
      level_id: payload.levelId,
      level_label: payload.levelLabel,
      goal: payload.goal,
      preferred_time: payload.preferredTime,
      comment: payload.comment || '',
      sheet_ok: Boolean(payload.sheetOk),
      meta: {
        source: 'telegram_bot',
        schema: 1,
        ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
      },
      updated_at: now,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapApplicationRow(data);
}

export async function getSubmissions(telegramUserId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('applications')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []).map(mapApplicationRow);
}

export async function findSubmission(telegramUserId, submissionId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('applications')
    .select('*')
    .eq('id', submissionId)
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapApplicationRow(data) : null;
}

export async function markCancelled(telegramUserId, submissionId) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('applications')
    .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
    .eq('id', submissionId)
    .eq('telegram_user_id', telegramUserId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ? mapApplicationRow(data) : null;
}

export function draftFromSubmission(sub) {
  return {
    serviceId: sub.serviceId,
    serviceTitle: sub.serviceTitle,
    name: sub.name,
    contact: sub.contact,
    levelId: sub.levelId,
    levelLabel: sub.levelLabel,
    goal: sub.goal,
    preferredTime: sub.preferredTime,
    comment: sub.comment,
  };
}

const MAX_AI_TURNS = 10;

export async function getAiMessages(telegramUserId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('ai_context').select('messages').eq('user_id', telegramUserId).maybeSingle();
  if (error) throw error;
  const raw = data?.messages;
  return Array.isArray(raw) ? raw : [];
}

export async function appendAiMessages(telegramUserId, entries) {
  const sb = getSupabase();
  const prev = await getAiMessages(telegramUserId);
  const next = [...prev, ...entries].slice(-MAX_AI_TURNS);
  const { error } = await sb.from('ai_context').upsert(
    {
      user_id: telegramUserId,
      messages: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

export async function clearAiContext(telegramUserId) {
  const sb = getSupabase();
  await sb.from('ai_context').delete().eq('user_id', telegramUserId);
}
