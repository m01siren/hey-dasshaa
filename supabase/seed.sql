-- Начальные данные контента (после 001_initial.sql)

insert into public.bot_strings (key, value) values
  ('intro', 'Привет! Я ассистент Даши — твоего репетитора по английскому. Я могу рассказать, как будут проходить уроки, помочь записаться на пробное занятие и ответить на частые вопросы. Выбери, что тебя интересует ниже.'),
  ('channel_url', 'https://t.me/your_channel'),
  ('menu_book', 'Записаться на урок'),
  ('menu_faq', 'Ответы на частые вопросы'),
  ('menu_channel', 'Канал Даши'),
  ('menu_contact', 'Связаться с преподавателем'),
  ('menu_requests', 'Мои заявки'),
  ('prompt_choose_service', 'Выбери услугу...'),
  ('prompt_name', 'Как тебя зовут? Напиши имя текстом.'),
  ('prompt_contact', 'Укажи номер телефона или @username в Telegram.'),
  ('prompt_level', 'Выбери свой уровень английского. Для пробного занятия это необязательно.'),
  ('prompt_goal', 'Напиши одним сообщением, для чего тебе нужен английский.'),
  ('prompt_time', 'Когда тебе удобно? Выбери вариант ниже или нажми «Напишу текстом».'),
  ('time_custom_btn', 'Напишу дату и время текстом'),
  ('prompt_time_custom', 'Напиши дату и время текстом.'),
  ('prompt_comment', 'Можешь оставить комментарий — я передам его преподавателю. Отправь текстом или нажми «Пропустить комментарий».'),
  ('prompt_faq', 'Выбери вопрос или напиши его одним сообщением. Я постараюсь помочь.'),
  ('prompt_contact_teacher', 'Что мне передать Дарье?'),
  ('success_submit', 'Спасибо! Я передам твою заявку преподавателю. Она свяжется с тобой в ближайшее время.'),
  ('error_submit', 'Не удалось сохранить заявку. Пожалуйста, попробуй еще раз позже.')
on conflict (key) do update set value = excluded.value;

insert into public.content_services (id, title, duration, price, sort_order, is_active) values
  ('trial', 'Пробное занятие', '30 мин', 'бесплатно', 10, true),
  ('indiv60', 'Индивидуально 60 мин', '60 мин', '1 500 ₽', 20, true),
  ('indiv90', 'Индивидуально 90 мин', '90 мин', '2 100 ₽', 30, true),
  ('conversation', 'Разговорный мини-клуб', '45 мин', '800 ₽', 40, true)
on conflict (id) do update set
  title = excluded.title,
  duration = excluded.duration,
  price = excluded.price,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.content_levels (id, label, sort_order, is_active) values
  ('zero', 'С нуля / A1', 10, true),
  ('a2', 'A2', 20, true),
  ('b1', 'B1', 30, true),
  ('b2', 'B2', 40, true),
  ('c1', 'C1+', 50, true),
  ('exam', 'Подготовка к экзамену', 60, false),
  ('unknown', 'Пока не знаю / обсудим на пробном', 70, true)
on conflict (id) do update set label = excluded.label, sort_order = excluded.sort_order, is_active = excluded.is_active;

insert into public.content_time_presets (id, label, sort_order, is_active) values
  ('morning', 'Утро (9–12)', 10, true),
  ('day', 'День (12–17)', 20, true),
  ('evening', 'Вечер (17–21)', 30, true),
  ('weekend', 'Только выходные', 40, true)
on conflict (id) do update set label = excluded.label, sort_order = excluded.sort_order, is_active = excluded.is_active;

insert into public.content_masters (id, name, focus, sort_order, is_active) values
  ('anna', 'Анна И.', 'разговорная практика, IELTS', 10, true),
  ('dmitry', 'Дмитрий К.', 'грамматика, бизнес-английский', 20, true)
on conflict (id) do update set name = excluded.name, focus = excluded.focus, sort_order = excluded.sort_order, is_active = excluded.is_active;

insert into public.content_faq (id, question, answer, sort_order, is_active) values
  ('format', 'Как проходят занятия?',
   'Онлайн в Zoom или Google Meet. Длительность и формат зависят от тарифа. Точные условия согласуются с преподавателем.',
   10, true),
  ('trial', 'Что такое пробное?',
   'Короткая встреча, чтобы познакомиться, оценить уровень и цели. Обычно 30 минут. Записаться можно через пункт «Записаться на пробное».',
   20, true),
  ('pay', 'Как оплачивать?',
   'Способы оплаты уточняются у преподавателя.',
   30, true),
  ('cancel_lesson', 'Как перенести урок?',
   'Напишите преподавателю заранее через «Связаться с преподавателем» или ответьте на напоминание в чате.',
   40, true),
  ('teachers', 'Кто ведёт занятия?',
   'Преподаватели: Анна И. — разговорная практика, IELTS; Дмитрий К. — грамматика, бизнес-английский. Точное расписание и закрепление — после связи с вами.',
   50, true)
on conflict (id) do update set
  question = excluded.question,
  answer = excluded.answer,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
