-- ============ 1. Профили ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

-- Автоматически создаём профиль при регистрации
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Профили для тех, кто уже зарегистрировался
insert into public.profiles (id, username)
select id, coalesce(raw_user_meta_data ->> 'username', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

-- ============ 2. Чаты, участники, сообщения ============
create table public.chats (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'private' check (type in ('private', 'group', 'channel')),
  title text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create index on public.chat_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id),
  text text not null check (char_length(text) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.messages (chat_id, created_at);

-- ============ 3. Защита данных ============
-- Функция: состоит ли текущий пользователь в чате
create function public.is_chat_member(_chat_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.chat_members
    where chat_id = _chat_id and user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy chats_select on public.chats
  for select to authenticated using (public.is_chat_member(id));

create policy members_select on public.chat_members
  for select to authenticated using (public.is_chat_member(chat_id));

create policy messages_select on public.messages
  for select to authenticated using (public.is_chat_member(chat_id));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_chat_member(chat_id));
create policy messages_update on public.messages
  for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());
create policy messages_delete on public.messages
  for delete to authenticated using (sender_id = auth.uid());

grant select, update on public.profiles to authenticated;
grant select on public.chats to authenticated;
grant select on public.chat_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;

-- ============ 4. Создание личного чата ============
-- Находит существующий чат с человеком или создаёт новый
create function public.start_private_chat(other_user uuid)
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

  insert into public.chats (type, created_by)
  values ('private', auth.uid())
  returning id into new_chat;

  insert into public.chat_members (chat_id, user_id)
  values (new_chat, auth.uid()), (new_chat, other_user);

  return new_chat;
end;
$$;

revoke execute on function public.start_private_chat(uuid) from anon;
grant execute on function public.start_private_chat(uuid) to authenticated;

-- ============ 5. Сообщения в реальном времени ============
alter publication supabase_realtime add table public.messages;