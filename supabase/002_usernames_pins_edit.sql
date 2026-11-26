-- ===== 1. Юзернеймы =====
alter table public.profiles rename column username to display_name;
alter table public.profiles add column username text;
alter table public.profiles
  add constraint username_format
  check (username is null or username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$');
create unique index profiles_username_key on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'username', '')
  );
  return new;
end;
$$;

create function public.username_available(handle text)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(handle)
  );
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ===== 2. Закрепление, архив, прочтение =====
alter table public.chat_members
  add column pinned boolean not null default false,
  add column archived boolean not null default false,
  add column last_read_at timestamptz not null default now();

create policy members_update on public.chat_members
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.chat_members from authenticated;
grant update (pinned, archived, last_read_at) on public.chat_members to authenticated;

-- ===== 3. Редактирование сообщений =====
alter table public.messages add column edited_at timestamptz;
revoke update on public.messages from authenticated;
grant update (text, edited_at) on public.messages to authenticated;

-- ===== 4. Реальное время для участников чатов =====
alter publication supabase_realtime add table public.chat_members;
