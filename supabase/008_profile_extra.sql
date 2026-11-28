-- ===== Этап 6: расширенный профиль =====
-- Статус (виден всем), город/дата рождения/ссылки (можно скрыть), смена почты.

alter table public.profiles add column if not exists status text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists birthday date;
alter table public.profiles add column if not exists links jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists show_extra boolean not null default true;

alter table public.profiles drop constraint if exists profiles_status_len;
alter table public.profiles add constraint profiles_status_len
  check (status is null or char_length(status) <= 120);

alter table public.profiles drop constraint if exists profiles_city_len;
alter table public.profiles add constraint profiles_city_len
  check (city is null or char_length(city) <= 80);

alter table public.profiles drop constraint if exists profiles_birthday_range;
alter table public.profiles add constraint profiles_birthday_range
  check (birthday is null or (birthday > date '1900-01-01' and birthday <= current_date));

alter table public.profiles drop constraint if exists profiles_links_object;
alter table public.profiles add constraint profiles_links_object
  check (jsonb_typeof(links) = 'object');

-- ---------- Права: свои поля менять можно ----------
revoke update on public.profiles from authenticated;
grant update (display_name, username, bio, allow_dm, avatar_url, last_seen_privacy,
              status, city, birthday, links, show_extra)
  on public.profiles to authenticated;

-- ---------- Приватность: город/дата/ссылки не отдаются напрямую ----------
-- Таблицу читаем только по безопасным колонкам, а скрытые поля — через функцию,
-- которая уважает настройку show_extra.
revoke select on public.profiles from authenticated;
grant select (id, display_name, username, bio, allow_dm, avatar_url,
              last_seen_privacy, banned, status)
  on public.profiles to authenticated;

create or replace function public.get_profile_extra(ids uuid[])
returns table (user_id uuid, city text, birthday date, links jsonb)
language sql stable
security definer set search_path = ''
as $$
  select p.id,
    case when p.id = auth.uid() or p.show_extra then p.city end,
    case when p.id = auth.uid() or p.show_extra then p.birthday end,
    case when p.id = auth.uid() or p.show_extra then p.links end
  from public.profiles p
  where p.id = any(ids) and public.can_use();
$$;

revoke execute on function public.get_profile_extra(uuid[]) from public, anon;
grant execute on function public.get_profile_extra(uuid[]) to authenticated;
