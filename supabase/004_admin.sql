-- ===== Этап 2: админ, блокировка, техперерыв, служебный чат, push =====
-- ВАЖНО: перед запуском замените ADMIN_EMAIL ниже на почту своего аккаунта.

-- 1. Администраторы (таблица закрыта для сайта, видна только базе)
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

insert into public.app_admins (user_id)
select id from auth.users where lower(email) = lower('ADMIN_EMAIL')
on conflict do nothing;

do $$
begin
  if not exists (select 1 from public.app_admins) then
    raise exception 'Аккаунт с такой почтой не найден: замените ADMIN_EMAIL на свою почту';
  end if;
end $$;

create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- 2. Настройки сайта: техперерыв и служебный чат
alter table public.chats drop constraint if exists chats_type_check;
alter table public.chats add constraint chats_type_check
  check (type in ('private', 'group', 'channel', 'system'));

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  maintenance boolean not null default false,
  maintenance_text text not null default 'Сайт временно не работает. Скоро вернёмся!',
  system_chat_id uuid references public.chats(id)
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

do $$
declare cid uuid;
begin
  if not exists (select 1 from public.app_settings) then
    insert into public.chats (type, title) values ('system', 'MessageRoom') returning id into cid;
    insert into public.app_settings (id, system_chat_id) values (1, cid);
  end if;
end $$;

-- Все пользователи состоят в служебном чате
insert into public.chat_members (chat_id, user_id)
select (select system_chat_id from public.app_settings where id = 1), id from auth.users
on conflict do nothing;

-- 3. Блокировка
alter table public.profiles add column if not exists banned boolean not null default false;

create or replace function public.chat_type(_chat_id uuid)
returns text
language sql stable
security definer set search_path = ''
as $$
  select type from public.chats where id = _chat_id;
$$;

-- Может ли текущий пользователь пользоваться сайтом (не заблокирован и нет техперерыва)
create or replace function public.can_use()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select coalesce((select not banned from public.profiles where id = auth.uid()), false)
     and (public.is_admin()
          or not coalesce((select maintenance from public.app_settings where id = 1), false));
$$;

-- 4. Новые пользователи: профиль + служебный чат
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare sys uuid;
begin
  insert into public.profiles (id, display_name, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
             'user' || replace(left(new.id::text, 13), '-', ''))
  );
  select system_chat_id into sys from public.app_settings where id = 1;
  if sys is not null then
    insert into public.chat_members (chat_id, user_id) values (sys, new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

-- 5. Правила доступа с учётом блокировки, техперерыва и служебного чата
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or public.can_use());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.can_use()) with check (id = auth.uid());

drop policy if exists chats_select on public.chats;
create policy chats_select on public.chats
  for select to authenticated using (public.can_use() and public.is_chat_member(id));

-- В служебном чате видна только своя строка участника (а не все пользователи сайта)
drop policy if exists members_select on public.chat_members;
create policy members_select on public.chat_members
  for select to authenticated using (
    public.can_use() and public.is_chat_member(chat_id)
    and (user_id = auth.uid() or public.chat_type(chat_id) <> 'system')
  );

drop policy if exists members_update on public.chat_members;
create policy members_update on public.chat_members
  for update to authenticated
  using (user_id = auth.uid() and public.can_use()) with check (user_id = auth.uid());

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (public.can_use() and public.is_chat_member(chat_id));

-- В служебный чат пишет только админ
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid() and public.can_use() and public.is_chat_member(chat_id)
    and (public.chat_type(chat_id) <> 'system' or public.is_admin())
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (sender_id = auth.uid() and public.can_use()) with check (sender_id = auth.uid());

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated using (sender_id = auth.uid() and public.can_use());

-- Личные чаты: заблокированные и во время техперерыва не создают
create or replace function public.start_private_chat(other_user uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  existing uuid;
  new_chat uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_use() then
    raise exception 'not allowed';
  end if;
  if other_user = auth.uid() then
    raise exception 'cannot chat with yourself';
  end if;

  select c.id into existing
  from public.chats c
  join public.chat_members m1 on m1.chat_id = c.id and m1.user_id = auth.uid()
  join public.chat_members m2 on m2.chat_id = c.id and m2.user_id = other_user
  where c.type = 'private'
  limit 1;

  if existing is not null then
    return existing;
  end if;

  if exists (select 1 from public.profiles where id = other_user and allow_dm = 'nobody') then
    raise exception 'dm_not_allowed';
  end if;

  insert into public.chats (type, created_by)
  values ('private', auth.uid())
  returning id into new_chat;

  insert into public.chat_members (chat_id, user_id)
  values (new_chat, auth.uid()), (new_chat, other_user);

  return new_chat;
end;
$$;

-- 6. Состояние сайта для текущего посетителя (доступно и без входа)
create or replace function public.get_app_status()
returns json
language sql stable
security definer set search_path = ''
as $$
  select json_build_object(
    'maintenance', s.maintenance,
    'maintenance_text', s.maintenance_text,
    'system_chat_id', s.system_chat_id,
    'is_admin', public.is_admin(),
    'banned', coalesce((select banned from public.profiles where id = auth.uid()), false)
  )
  from public.app_settings s where s.id = 1;
$$;
grant execute on function public.get_app_status() to anon, authenticated;

-- 7. Функции админ-панели (каждая проверяет, что вызывает админ)
create or replace function public.admin_search_users(q text)
returns table (
  id uuid, display_name text, username text, email text,
  banned boolean, created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, p.display_name, p.username, u.email::text, p.banned, u.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where coalesce(q, '') = ''
       or p.username ilike '%' || q || '%'
       or p.display_name ilike '%' || q || '%'
       or u.email ilike '%' || q || '%'
    order by u.created_at desc
    limit 50;
end;
$$;

create or replace function public.admin_stats()
returns json
language plpgsql stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'banned', (select count(*) from public.profiles where banned),
    'messages', (select count(*) from public.messages),
    'push', (select count(*) from public.push_subscriptions)
  );
end;
$$;

create or replace function public.admin_set_banned(target uuid, value boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if target = auth.uid() then raise exception 'cannot ban yourself'; end if;
  update public.profiles set banned = value where id = target;
end;
$$;

create or replace function public.admin_set_maintenance(enabled boolean, msg text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.app_settings
  set maintenance = enabled,
      maintenance_text = coalesce(nullif(trim(msg), ''), maintenance_text)
  where id = 1;
end;
$$;

-- 8. Подписки на push-уведомления
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create or replace function public.save_push_subscription(_endpoint text, _p256dh text, _auth text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (_endpoint, auth.uid(), _p256dh, _auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create or replace function public.delete_push_subscription(_endpoint text)
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = _endpoint and user_id = auth.uid();
$$;

revoke execute on function public.admin_search_users(text) from public, anon;
grant execute on function public.admin_search_users(text) to authenticated;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
revoke execute on function public.admin_set_banned(uuid, boolean) from public, anon;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;
revoke execute on function public.admin_set_maintenance(boolean, text) from public, anon;
grant execute on function public.admin_set_maintenance(boolean, text) to authenticated;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;
