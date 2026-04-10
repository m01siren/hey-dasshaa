-- Запуск: SQL Editor в Supabase или supabase db push

create table if not exists public.telegram_profiles (
  id bigint primary key,
  chat_id bigint not null,
  username text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null references public.telegram_profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  service_id text,
  service_title text,
  name text,
  contact text,
  level_id text,
  level_label text,
  goal text,
  preferred_time text,
  comment text,
  sheet_ok boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index if not exists applications_user_created_idx
  on public.applications (telegram_user_id, created_at desc);

create table if not exists public.booking_sessions (
  user_id bigint primary key references public.telegram_profiles (id) on delete cascade,
  state text not null default 'MAIN_MENU',
  draft jsonb not null default '{}'::jsonb,
  editing_submission_id uuid references public.applications (id) on delete set null,
  resume_to_confirm boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_context (
  user_id bigint primary key references public.telegram_profiles (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Контент бота (не персональные данные)
create table if not exists public.bot_strings (
  key text primary key,
  value text not null
);

create table if not exists public.content_services (
  id text primary key,
  title text not null,
  duration text not null,
  price text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table if not exists public.content_levels (
  id text primary key,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table if not exists public.content_time_presets (
  id text primary key,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table if not exists public.content_masters (
  id text primary key,
  name text not null,
  focus text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table if not exists public.content_faq (
  id text primary key,
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

-- Доступ только с сервера через SUPABASE_SERVICE_ROLE_KEY.
-- При необходимости включите RLS и политики для anon/authenticated.
