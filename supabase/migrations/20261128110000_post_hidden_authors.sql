create table if not exists public.post_hidden_authors (
  user_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, author_id),
  constraint post_hidden_authors_not_self check (user_id <> author_id)
);

alter table public.post_hidden_authors enable row level security;

create policy post_hidden_authors_select
on public.post_hidden_authors
for select to authenticated
using (user_id = (select auth.uid()));

create policy post_hidden_authors_insert
on public.post_hidden_authors
for insert to authenticated
with check (user_id = (select auth.uid()) and author_id <> (select auth.uid()));

create policy post_hidden_authors_delete
on public.post_hidden_authors
for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, delete on public.post_hidden_authors to authenticated;
