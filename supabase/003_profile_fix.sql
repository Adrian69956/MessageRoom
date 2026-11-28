-- ===== Этап 1: профиль (о себе, кто может писать) и обязательный юзернейм =====

-- 1. Колонки профиля (если их ещё нет)
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists allow_dm text not null default 'everyone';

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 200);
alter table public.profiles drop constraint if exists profiles_allow_dm_values;
alter table public.profiles add constraint profiles_allow_dm_values
  check (allow_dm in ('everyone', 'nobody'));

-- 2. Пользователь может менять в своём профиле только эти поля
revoke update on public.profiles from authenticated;
grant update (display_name, username, bio, allow_dm) on public.profiles to authenticated;

-- 3. Обязательный юзернейм: тем, у кого его нет, выдаём временный (его можно сменить в настройках)
update public.profiles
set username = 'user' || replace(left(id::text, 13), '-', '')
where username is null;
alter table public.profiles alter column username set not null;

alter table public.profiles drop constraint if exists username_format;
alter table public.profiles add constraint username_format
  check (username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$');

-- При регистрации без юзернейма тоже выдаём временный
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
             'user' || replace(left(new.id::text, 13), '-', ''))
  );
  return new;
end;
$$;

-- 4. Личный чат: учитываем настройку «Кто может начать со мной чат»
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
