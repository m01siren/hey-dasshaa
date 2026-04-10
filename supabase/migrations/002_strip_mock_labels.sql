-- Убирает суффикс "(mock)" из контента, если он остался после старых сидов.

update public.content_services set
  title = regexp_replace(title, '\s*\(mock\)\s*', '', 'gi'),
  duration = regexp_replace(duration, '\s*\(mock\)\s*', '', 'gi'),
  price = regexp_replace(price, '\s*\(mock\)\s*', '', 'gi')
where title ~* '\(mock\)' or duration ~* '\(mock\)' or price ~* '\(mock\)';

update public.content_faq set
  question = regexp_replace(question, '\s*\(mock\)\s*', '', 'gi'),
  answer = regexp_replace(answer, '\s*\(mock\)\s*', '', 'gi')
where question ~* '\(mock\)' or answer ~* '\(mock\)';

update public.content_masters set
  name = regexp_replace(name, '\s*\(mock\)\s*', '', 'gi'),
  focus = regexp_replace(focus, '\s*\(mock\)\s*', '', 'gi')
where name ~* '\(mock\)' or focus ~* '\(mock\)';

update public.bot_strings set
  value = regexp_replace(value, '\s*\(mock\)\s*', '', 'gi')
where value ~* '\(mock\)';
