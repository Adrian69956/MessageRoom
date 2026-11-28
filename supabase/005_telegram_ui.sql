-- ===== Этап 3: интерфейс как в Telegram =====
-- Фото профиля, «был(а) в сети», конфиденциальность, ответы на сообщения,
-- выключение уведомлений чата, очистка истории и чёрный список.

-- 1. Профиль: фото и настройка «Кто видит время захода»
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists last_seen_privacy text not null default 'everyone';
alter table public.profiles drop constraint if exists profiles_last_seen_privacy_values;
alter table public.profiles add constraint profiles_last_seen_privacy_values
  check (last_seen_privacy in ('everyone', 'nobody'));
alter table public.profiles drop constraint if exists profiles_avatar_url_length;
alter table public.profiles add constraint profiles_avatar_url_length
  check (avatar_url is null or char_length(avatar_url) <= 500);

revoke update on public.profiles from authenticated;
grant update (display_name, username, bio, allow_dm, avatar_url, last_seen_privacy)
  on public.profiles to authenticated;

-- 2. Участник чата: уведомления выключены, история очищена (только у себя)
alter table public.chat_members add column if not exists muted boolean not null default false;
alter table public.chat_members add column if not exists cleared_at timestamptz;
revoke update on public.chat_members from authenticated;
grant update (pinned, archived, last_read_at, muted, cleared_at) on public.chat_members to authenticated;

-- 3. Ответ на сообщение
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;

-- 4. Чёрный список
create table if not exists public.user_blocks (
  blocker uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists blocks_select on public.user_blocks;
create policy blocks_select on public.user_blocks
  for select to authenticated using (blocker = auth.uid() and public.can_use());
drop policy if exists blocks_insert on public.user_blocks;
create policy blocks_insert on public.user_blocks
  for insert to authenticated with check (blocker = auth.uid() and public.can_use());
drop policy if exists blocks_delete on public.user_blocks;
create policy blocks_delete on public.user_blocks
  for delete to authenticated using (blocker = auth.uid() and public.can_use());

-- 5. Время последнего захода (читается только через функцию с учётом конфиденциальности)
create table if not exists public.presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);
alter table public.presence enable row level security;
revoke all on public.presence from anon, authenticated;

create or replace function public.touch_presence()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_use() then return; end if;
  insert into public.presence (user_id, last_seen) values (auth.uid(), now())
  on conflict (user_id) do update set last_seen = now();
end;
$$;

-- Если человек скрыл время захода (или вы скрыли своё), вместо точного времени
-- возвращается примерное: recently (до 3 дней), week, month, long.
create or replace function public.get_presence(ids uuid[])
returns table (user_id uuid, last_seen timestamptz, approx text)
language sql stable
security definer set search_path = ''
as $$
  select p.id,
    case when p.id = auth.uid()
           or (p.last_seen_privacy = 'everyone'
               and coalesce((select last_seen_privacy from public.profiles where id = auth.uid()), 'everyone') = 'everyone')
         then pr.last_seen end,
    case when pr.last_seen is null then 'long'
         when pr.last_seen > now() - interval '3 days' then 'recently'
         when pr.last_seen > now() - interval '7 days' then 'week'
         when pr.last_seen > now() - interval '30 days' then 'month'
         else 'long' end
  from public.profiles p
  left join public.presence pr on pr.user_id = p.id
  where public.can_use() and p.id = any(ids)
    and not exists (select 1 from public.user_blocks b where b.blocker = p.id and b.blocked = auth.uid());
$$;

-- Есть ли блокировка между мной и собеседником в личном чате (в любую сторону)
create or replace function public.private_chat_blocked(_chat_id uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.chats c
    join public.chat_members m on m.chat_id = c.id and m.user_id <> auth.uid()
    join public.user_blocks b
      on (b.blocker = auth.uid() and b.blocked = m.user_id)
      or (b.blocker = m.user_id and b.blocked = auth.uid())
    where c.id = _chat_id and c.type = 'private'
  );
$$;

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid() and public.can_use() and public.is_chat_member(chat_id)
    and (public.chat_type(chat_id) <> 'system' or public.is_admin())
    and not public.private_chat_blocked(chat_id)
  );

-- 6. Хранилище фото профиля: каждый загружает только в свою папку
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 7. Права на функции
revoke execute on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;
revoke execute on function public.get_presence(uuid[]) from public, anon;
grant execute on function public.get_presence(uuid[]) to authenticated;
revoke execute on function public.private_chat_blocked(uuid) from public, anon;
grant execute on function public.private_chat_blocked(uuid) to authenticated;
