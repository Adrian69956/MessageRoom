-- ===== Этап 4: лента постов, реакции, комментарии =====
-- Посты видят все вошедшие. Писать могут все или только админ —
-- это переключатель posting_policy в админке.

-- ---------- 1. Таблицы ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists posts_created_idx on public.posts (created_at desc);

-- Одна реакция от человека на пост: поменял смайлик — запись обновилась
create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null default '❤️' check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_reactions_post_idx on public.post_reactions (post_id);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

-- ---------- 2. Настройка «кто может публиковать» ----------
alter table public.app_settings add column if not exists posting_policy text not null default 'everyone';

do $$
begin
  alter table public.app_settings add constraint app_settings_posting_policy_values
    check (posting_policy in ('everyone', 'admin', 'nobody'));
exception when duplicate_object then null;
end $$;

create or replace function public.posting_policy()
returns text
language sql stable
security definer set search_path = ''
as $$
  select coalesce((select posting_policy from public.app_settings where id = 1), 'everyone');
$$;

-- Может ли текущий пользователь публиковать посты прямо сейчас
create or replace function public.can_post()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select public.can_use()
     and (public.is_admin() or public.posting_policy() = 'everyone');
$$;

-- ---------- 3. Защита данных ----------
alter table public.posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;

create policy posts_select on public.posts
  for select to authenticated using (public.can_use());
create policy posts_insert on public.posts
  for insert to authenticated with check (author_id = auth.uid() and public.can_post());
create policy posts_update on public.posts
  for update to authenticated
  using (author_id = auth.uid() and public.can_use()) with check (author_id = auth.uid());
create policy posts_delete on public.posts
  for delete to authenticated
  using (public.can_use() and (author_id = auth.uid() or public.is_admin()));

create policy reactions_select on public.post_reactions
  for select to authenticated using (public.can_use());
create policy reactions_insert on public.post_reactions
  for insert to authenticated with check (user_id = auth.uid() and public.can_use());
create policy reactions_update on public.post_reactions
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reactions_delete on public.post_reactions
  for delete to authenticated using (user_id = auth.uid());

create policy comments_select on public.post_comments
  for select to authenticated using (public.can_use());
create policy comments_insert on public.post_comments
  for insert to authenticated with check (author_id = auth.uid() and public.can_use());
create policy comments_delete on public.post_comments
  for delete to authenticated
  using (public.can_use() and (author_id = auth.uid() or public.is_admin()));

-- ---------- 4. Права (как у остальных таблиц: только нужные колонки) ----------
revoke all on public.posts from anon, authenticated;
grant select, insert, delete on public.posts to authenticated;
revoke update on public.posts from authenticated;
grant update (text, edited_at) on public.posts to authenticated;

revoke all on public.post_reactions from anon, authenticated;
grant select, insert, delete on public.post_reactions to authenticated;
revoke update on public.post_reactions from authenticated;
grant update (emoji) on public.post_reactions to authenticated;

revoke all on public.post_comments from anon, authenticated;
grant select, insert, delete on public.post_comments to authenticated;
revoke update on public.post_comments from authenticated;

-- ---------- 5. Состояние приложения: добавились правила постов ----------
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
    'banned', coalesce((select banned from public.profiles where id = auth.uid()), false),
    'posting_policy', s.posting_policy,
    'can_post', public.can_post()
  )
  from public.app_settings s where s.id = 1;
$$;
grant execute on function public.get_app_status() to anon, authenticated;

-- ---------- 6. Админ: переключение «кто может публиковать» ----------
create or replace function public.admin_set_posting_policy(value text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if value not in ('everyone', 'admin', 'nobody') then raise exception 'bad value'; end if;
  update public.app_settings set posting_policy = value where id = 1;
end;
$$;

revoke execute on function public.admin_set_posting_policy(text) from public, anon;
grant execute on function public.admin_set_posting_policy(text) to authenticated;
revoke execute on function public.posting_policy() from public, anon;
grant execute on function public.posting_policy() to authenticated;
revoke execute on function public.can_post() from public, anon;
grant execute on function public.can_post() to authenticated;

-- ---------- 7. Реальное время ----------
do $$
begin
  begin alter publication supabase_realtime add table public.posts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.post_reactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.post_comments; exception when duplicate_object then null; end;
end $$;
