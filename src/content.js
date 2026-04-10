import { getSupabase } from './supabase.js';

/** @type {Awaited<ReturnType<typeof loadContentCache>> | null} */
let cache = null;

export async function loadContentCache() {
  const sb = getSupabase();

  const [
    stringsRes,
    servicesRes,
    levelsRes,
    presetsRes,
    mastersRes,
    faqRes,
  ] = await Promise.all([
    sb.from('bot_strings').select('key, value'),
    sb.from('content_services').select('*').eq('is_active', true).order('sort_order'),
    sb.from('content_levels').select('*').eq('is_active', true).order('sort_order'),
    sb.from('content_time_presets').select('*').eq('is_active', true).order('sort_order'),
    sb.from('content_masters').select('*').eq('is_active', true).order('sort_order'),
    sb.from('content_faq').select('*').eq('is_active', true).order('sort_order'),
  ]);

  const errors = [stringsRes, servicesRes, levelsRes, presetsRes, mastersRes, faqRes]
    .map((r) => r.error)
    .filter(Boolean);
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }

  const strings = Object.fromEntries((stringsRes.data || []).map((r) => [r.key, r.value]));

  cache = {
    strings,
    intro: strings.intro || '',
    channelUrl: strings.channel_url || 'https://t.me/',
    services: (servicesRes.data || []).map((r) => ({
      id: r.id,
      title: r.title,
      duration: r.duration,
      price: r.price,
    })),
    // В текущей версии исключаем пункт "подготовка к экзамену"
    englishLevels: (levelsRes.data || [])
      .filter((r) => String(r.id).toLowerCase() !== 'exam')
      .map((r) => ({ id: r.id, label: r.label })),
    timePresets: (presetsRes.data || []).map((r) => ({ id: r.id, label: r.label })),
    masters: (mastersRes.data || []).map((r) => ({ id: r.id, name: r.name, focus: r.focus })),
    faqItems: (faqRes.data || []).map((r) => ({ id: r.id, question: r.question, answer: r.answer })),
  };

  return cache;
}

export function getContent() {
  if (!cache) {
    throw new Error('Контент не загружен: вызовите loadContentCache() при старте');
  }
  return cache;
}

/** URL канала: приоритет .env CHANNEL_URL, иначе значение из bot_strings */
export function getChannelUrl() {
  const env = process.env.CHANNEL_URL?.trim();
  if (env) return env;
  return getContent().channelUrl;
}
