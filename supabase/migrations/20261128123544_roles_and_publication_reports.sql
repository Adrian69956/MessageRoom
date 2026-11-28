-- Role-based staff permissions and publication reports for MessageRoom.
-- Existing app_admins entries remain the owners for backwards compatibility.

create table if not exists public.app_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.app_roles enable row level security;
revoke all on public.app_roles from anon, authenticated;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.is_admin_role()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_roles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_roles where user_id = auth.uid() and role = 'moderator');
$$;

create or replace function public.can_manage_reports()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_owner() or public.is_moderator();
$$;

create or replace function public.can_moderate_content()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_owner() or public.is_admin_role();
$$;

-- Keep is_admin() as the legacy owner-only capability so existing owner tools
-- (statistics, broadcast, maintenance, user search) do not leak to Admin.
create or replace function public.get_app_status()
returns json language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'maintenance', s.maintenance,
    'maintenance_text', s.maintenance_text,
    'system_chat_id', s.system_chat_id,
    'is_admin', public.is_admin(),
    'is_owner', public.is_owner(),
    'is_admin_role', public.is_admin_role(),
    'is_moderator', public.is_moderator(),
    'role', case
      when public.is_owner() then 'owner'
      when public.is_admin_role() then 'admin'
      when public.is_moderator() then 'moderator'
      else 'user'
    end,
    'banned', coalesce((select banned from public.profiles where id = auth.uid()), false),
    'posting_policy', s.posting_policy,
    'can_post', public.can_post()
  )
  from public.app_settings s where s.id = 1;
$$;
grant execute on function public.get_app_status() to anon, authenticated;

create or replace function public.can_post()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.can_use()
     and (public.is_admin() or public.is_admin_role() or public.posting_policy() = 'everyone');
$$;
revoke execute on function public.can_post() from public, anon;
grant execute on function public.can_post() to authenticated;

-- Owner-only role assignment and staff directory.
create or replace function public.owner_set_role(target uuid, new_role text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  if target is null or exists (select 1 from public.app_admins where user_id = target) then
    raise exception 'owner_role_is_immutable';
  end if;
  if new_role = 'user' then
    delete from public.app_roles where user_id = target;
  elsif new_role in ('admin', 'moderator') then
    insert into public.app_roles (user_id, role, assigned_by)
    values (target, new_role, auth.uid())
    on conflict (user_id) do update
      set role = excluded.role, assigned_by = excluded.assigned_by;
  else
    raise exception 'invalid_role';
  end if;
end;
$$;
revoke execute on function public.owner_set_role(uuid, text) from public, anon;
grant execute on function public.owner_set_role(uuid, text) to authenticated;

create or replace function public.owner_search_users(q text)
returns table (id uuid, display_name text, username text, email text, role text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  return query
    select p.id, p.display_name, p.username, u.email::text,
      case when exists (select 1 from public.app_admins oa where oa.user_id = p.id) then 'owner'
           else coalesce(ar.role, 'user') end
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.app_roles ar on ar.user_id = p.id
    where coalesce(q, '') = ''
       or p.username ilike '%' || q || '%'
       or p.display_name ilike '%' || q || '%'
       or u.email ilike '%' || q || '%'
    order by u.created_at desc
    limit 50;
end;
$$;
revoke execute on function public.owner_search_users(text) from public, anon;
grant execute on function public.owner_search_users(text) to authenticated;

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in (
    'Спам или реклама', 'Оскорбления и травля', 'Ненависть или дискриминация',
    'Неприемлемый контент', 'Мошенничество', 'Нарушение авторских прав', 'Другое'
  )),
  details text,
  priority boolean not null default false,
  status text not null default 'new' check (status in ('new', 'resolved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);
create index if not exists post_reports_status_created_idx
  on public.post_reports(status, priority desc, created_at asc);
alter table public.post_reports enable row level security;
revoke all on public.post_reports from anon, authenticated;
grant select, insert, delete on public.post_reports to authenticated;
grant update (status, reviewed_by, reviewed_at) on public.post_reports to authenticated;

drop policy if exists post_reports_select_staff on public.post_reports;
create policy post_reports_select_staff on public.post_reports
  for select to authenticated using (public.can_manage_reports());
drop policy if exists post_reports_insert_self on public.post_reports;
create policy post_reports_insert_self on public.post_reports
  for insert to authenticated with check (
    reporter_id = auth.uid() and public.can_use()
    and exists (select 1 from public.posts p where p.id = post_id)
    and priority = public.is_moderator()
  );
drop policy if exists post_reports_update_staff on public.post_reports;
create policy post_reports_update_staff on public.post_reports
  for update to authenticated using (public.can_manage_reports())
  with check (public.can_manage_reports() and reviewed_by = auth.uid());
drop policy if exists post_reports_delete_staff on public.post_reports;
create policy post_reports_delete_staff on public.post_reports
  for delete to authenticated using (public.can_manage_reports());

create table if not exists public.staff_action_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists staff_action_log_actor_created_idx
  on public.staff_action_log(actor_id, created_at desc);
alter table public.staff_action_log enable row level security;
revoke all on public.staff_action_log from anon, authenticated;
grant select on public.staff_action_log to authenticated;
drop policy if exists staff_action_log_read_own_or_owner on public.staff_action_log;
create policy staff_action_log_read_own_or_owner on public.staff_action_log
  for select to authenticated using (public.is_owner() or actor_id = auth.uid());

create or replace function public.log_post_report_action()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare who uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.staff_action_log(actor_id, action, target_type, target_id, details)
    values (who, 'report_submitted', 'post_report', new.id,
      jsonb_build_object('post_id', new.post_id, 'reason', new.reason, 'priority', new.priority));
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      insert into public.staff_action_log(actor_id, action, target_type, target_id, details)
      values (who, 'report_status_changed', 'post_report', new.id,
        jsonb_build_object('post_id', new.post_id, 'from', old.status, 'to', new.status));
    end if;
    return new;
  else
    insert into public.staff_action_log(actor_id, action, target_type, target_id, details)
    values (who, 'report_deleted', 'post_report', old.id,
      jsonb_build_object('post_id', old.post_id, 'reason', old.reason));
    return old;
  end if;
end;
$$;
drop trigger if exists post_reports_audit on public.post_reports;
create trigger post_reports_audit after insert or update or delete on public.post_reports
  for each row execute function public.log_post_report_action();

create or replace function public.log_moderated_content_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and old.author_id <> auth.uid() and public.can_moderate_content() then
    insert into public.staff_action_log(actor_id, action, target_type, target_id, details)
    values (auth.uid(), tg_table_name || '_deleted', tg_table_name, old.id,
      jsonb_build_object('author_id', old.author_id, 'text', left(coalesce(old.text, ''), 500)));
  end if;
  return old;
end;
$$;
drop trigger if exists posts_moderation_audit on public.posts;
create trigger posts_moderation_audit after delete on public.posts
  for each row execute function public.log_moderated_content_delete();
drop trigger if exists comments_moderation_audit on public.post_comments;
create trigger comments_moderation_audit after delete on public.post_comments
  for each row execute function public.log_moderated_content_delete();

drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (public.can_use() and (author_id = auth.uid() or public.can_moderate_content()));
drop policy if exists comments_delete on public.post_comments;
create policy comments_delete on public.post_comments for delete to authenticated
  using (public.can_use() and (author_id = auth.uid() or public.can_moderate_content()));

do $$
begin
  begin alter publication supabase_realtime add table public.post_reports;
  exception when duplicate_object then null;
  end;
end $$;

grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_admin_role() to authenticated;
grant execute on function public.is_moderator() to authenticated;
grant execute on function public.can_manage_reports() to authenticated;
grant execute on function public.can_moderate_content() to authenticated;
