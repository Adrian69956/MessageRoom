-- Moderation tools and in-site support center.
create table if not exists public.user_warnings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 issued_by uuid references auth.users(id) on delete set null,
 reason text not null,
 created_at timestamptz not null default now()
);
create index if not exists user_warnings_user_created_idx on public.user_warnings(user_id,created_at desc);
alter table public.user_warnings enable row level security;
revoke all on public.user_warnings from anon,authenticated;
grant select on public.user_warnings to authenticated;
create policy user_warnings_read_self_or_staff on public.user_warnings for select to authenticated
 using(user_id=auth.uid() or public.is_owner() or public.is_admin_role() or public.is_moderator());

create table if not exists public.user_restrictions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 restriction_type text not null check(restriction_type in ('posts','comments','media')),
 reason text not null,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 revoked_by uuid references auth.users(id) on delete set null
);
create index if not exists user_restrictions_active_idx on public.user_restrictions(user_id,restriction_type,expires_at) where revoked_at is null;
alter table public.user_restrictions enable row level security;
revoke all on public.user_restrictions from anon,authenticated;
grant select on public.user_restrictions to authenticated;
create policy user_restrictions_read_self_or_staff on public.user_restrictions for select to authenticated
 using(user_id=auth.uid() or public.is_owner() or public.is_admin_role());

create or replace function public.has_active_restriction(target uuid,kind text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.user_restrictions r where r.user_id=target and r.restriction_type=kind and r.revoked_at is null and r.expires_at>now()); $$;

create or replace function public.staff_issue_warning(target uuid,warning_reason text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare new_id uuid;
begin
 if not(public.is_owner() or public.is_moderator()) then raise exception 'forbidden'; end if;
 if target=auth.uid() or exists(select 1 from public.app_admins where user_id=target) or exists(select 1 from public.app_roles where user_id=target) then raise exception 'cannot_warn_staff'; end if;
 if nullif(trim(warning_reason),'') is null then raise exception 'reason_required'; end if;
 insert into public.user_warnings(user_id,issued_by,reason) values(target,auth.uid(),trim(warning_reason)) returning id into new_id;
 insert into public.staff_action_log(actor_id,action,target_type,target_id,details) values(auth.uid(),'warning_issued','user',target,jsonb_build_object('warning_id',new_id,'reason',trim(warning_reason)));
 return new_id;
end $$;
revoke execute on function public.staff_issue_warning(uuid,text) from public,anon;
grant execute on function public.staff_issue_warning(uuid,text) to authenticated;

create or replace function public.admin_set_restriction(target uuid,kind text,duration_days integer,restriction_reason text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare new_id uuid;
begin
 if not(public.is_owner() or public.is_admin_role()) then raise exception 'forbidden'; end if;
 if kind not in('posts','comments','media') then raise exception 'invalid_restriction'; end if;
 if duration_days<1 or duration_days>24 then raise exception 'duration_must_be_1_to_24_days'; end if;
 if target=auth.uid() or exists(select 1 from public.app_admins where user_id=target) or exists(select 1 from public.app_roles where user_id=target) then raise exception 'cannot_restrict_staff'; end if;
 if nullif(trim(restriction_reason),'') is null then raise exception 'reason_required'; end if;
 insert into public.user_restrictions(user_id,restriction_type,reason,created_by,expires_at) values(target,kind,trim(restriction_reason),auth.uid(),now()+make_interval(days=>duration_days)) returning id into new_id;
 insert into public.staff_action_log(actor_id,action,target_type,target_id,details) values(auth.uid(),'restriction_issued','user',target,jsonb_build_object('restriction_id',new_id,'type',kind,'days',duration_days,'reason',trim(restriction_reason)));
 return new_id;
end $$;
revoke execute on function public.admin_set_restriction(uuid,text,integer,text) from public,anon;
grant execute on function public.admin_set_restriction(uuid,text,integer,text) to authenticated;

create or replace function public.admin_revoke_restriction(target_restriction uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare r public.user_restrictions%rowtype;
begin
 select * into r from public.user_restrictions where id=target_restriction for update;
 if not found then raise exception 'restriction_not_found'; end if;
 if not public.is_owner() and (not public.is_admin_role() or r.created_by<>auth.uid()) then raise exception 'forbidden'; end if;
 update public.user_restrictions set revoked_at=now(),revoked_by=auth.uid() where id=target_restriction;
 insert into public.staff_action_log(actor_id,action,target_type,target_id,details) values(auth.uid(),'restriction_revoked','user',r.user_id,jsonb_build_object('restriction_id',target_restriction,'type',r.restriction_type));
end $$;
revoke execute on function public.admin_revoke_restriction(uuid) from public,anon;
grant execute on function public.admin_revoke_restriction(uuid) to authenticated;

create or replace function public.get_my_moderation_status()
returns json language sql stable security definer set search_path=''
as $$
 select json_build_object(
  'warnings',coalesce((select json_agg(json_build_object('id',w.id,'reason',w.reason,'created_at',w.created_at) order by w.created_at desc) from public.user_warnings w where w.user_id=auth.uid()),'[]'::json),
  'restrictions',coalesce((select json_agg(json_build_object('id',r.id,'type',r.restriction_type,'reason',r.reason,'expires_at',r.expires_at) order by r.created_at desc) from public.user_restrictions r where r.user_id=auth.uid() and r.revoked_at is null and r.expires_at>now()),'[]'::json)
 );
$$;
grant execute on function public.get_my_moderation_status() to authenticated;

create or replace function public.can_post()
returns boolean language sql stable security definer set search_path=''
as $$ select public.can_use() and not public.has_active_restriction(auth.uid(),'posts') and (public.is_admin() or public.is_admin_role() or public.posting_policy()='everyone'); $$;
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated with check(author_id=auth.uid() and public.can_post() and ((media_path is null and voice_path is null) or not public.has_active_restriction(auth.uid(),'media')));
drop policy if exists comments_insert on public.post_comments;
create policy comments_insert on public.post_comments for insert to authenticated with check(author_id=auth.uid() and public.can_use() and not public.has_active_restriction(auth.uid(),'comments'));

create table if not exists public.support_tickets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 category text not null check(category in('complaint','appeal','question','bug','other')),
 subject text not null,
 description text not null,
 status text not null default 'open' check(status in('open','closed')),
 assigned_to uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 closed_at timestamptz
);
create index if not exists support_tickets_user_updated_idx on public.support_tickets(user_id,updated_at desc);
create index if not exists support_tickets_status_updated_idx on public.support_tickets(status,updated_at desc);
create table if not exists public.support_messages (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 sender_id uuid references auth.users(id) on delete set null,
 body text not null default '',
 is_internal boolean not null default false,
 created_at timestamptz not null default now(),
 attachment_path text,
 attachment_name text,
 attachment_type text
);
create index if not exists support_messages_ticket_created_idx on public.support_messages(ticket_id,created_at);
create table if not exists public.support_internal_notes (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,
 body text not null,
 created_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_internal_notes enable row level security;
revoke all on public.support_tickets,public.support_messages,public.support_internal_notes from anon,authenticated;
grant select on public.support_tickets,public.support_messages,public.support_internal_notes to authenticated;

create or replace function public.support_staff_can_access(ticket_category text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.is_owner() or (public.is_admin_role() and ticket_category in('question','bug','other')); $$;
create or replace function public.support_can_access_ticket(ticket uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.support_tickets t where t.id=ticket and (t.user_id=auth.uid() or public.support_staff_can_access(t.category))); $$;
create policy support_tickets_read on public.support_tickets for select to authenticated using(user_id=auth.uid() or public.support_staff_can_access(category));
create policy support_messages_read on public.support_messages for select to authenticated using(public.support_can_access_ticket(ticket_id) and (not is_internal or public.is_owner() or public.is_admin_role()));
create policy support_internal_notes_read on public.support_internal_notes for select to authenticated using(public.support_can_access_ticket(ticket_id) and (public.is_owner() or public.is_admin_role()));

create or replace function public.support_create_ticket(ticket_category text,ticket_subject text,ticket_description text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare ticket_id uuid;
begin
 if auth.uid() is null then raise exception 'auth_required'; end if;
 if ticket_category not in('complaint','appeal','question','bug','other') then raise exception 'invalid_category'; end if;
 if length(trim(coalesce(ticket_subject,'')))=0 or length(trim(coalesce(ticket_description,'')))=0 then raise exception 'subject_and_description_required'; end if;
 insert into public.support_tickets(user_id,category,subject,description) values(auth.uid(),ticket_category,left(trim(ticket_subject),160),left(trim(ticket_description),5000)) returning id into ticket_id;
 insert into public.support_messages(ticket_id,sender_id,body) values(ticket_id,auth.uid(),trim(ticket_description));
 insert into public.staff_action_log(actor_id,action,target_type,target_id,details) values(auth.uid(),'support_ticket_created','support_ticket',ticket_id,jsonb_build_object('category',ticket_category));
 return ticket_id;
end $$;
revoke execute on function public.support_create_ticket(text,text,text) from public,anon;
grant execute on function public.support_create_ticket(text,text,text) to authenticated;

create or replace function public.support_send_message(ticket uuid,message_body text,internal_note boolean default false)
returns uuid language plpgsql security definer set search_path=''
as $$
declare t public.support_tickets%rowtype; new_id uuid;
begin
 select * into t from public.support_tickets where id=ticket for update;
 if not found then raise exception 'ticket_not_found'; end if;
 if t.user_id=auth.uid() then if internal_note then raise exception 'forbidden'; end if;
 elsif not public.support_staff_can_access(t.category) then raise exception 'forbidden'; end if;
 if t.status='closed' and not public.is_owner() then raise exception 'ticket_closed'; end if;
 if length(trim(coalesce(message_body,'')))=0 then raise exception 'message_required'; end if;
 insert into public.support_messages(ticket_id,sender_id,body,is_internal) values(ticket,auth.uid(),left(trim(message_body),5000),internal_note) returning id into new_id;
 update public.support_tickets set updated_at=now() where id=ticket;
 if internal_note then insert into public.support_internal_notes(ticket_id,author_id,body) values(ticket,auth.uid(),left(trim(message_body),5000)); end if;
 insert into public.staff_action_log(actor_id,action,target_type,target_id,details) values(auth.uid(),case when internal_note then 'support_internal_note' else 'support_message_sent' end,'support_ticket',ticket,jsonb_build_object('message_id',new_id));
 return new_id;
end $$;
revoke execute on function public.support_send_message(uuid,text,boolean) from public,anon;
grant execute on function public.support_send_message(uuid,text,boolean) to authenticated;

create or replace function public.support_set_ticket_status(ticket uuid,new_status text)
returns void language plpgsql security definer set search_path=''
as $$
declare t public.support_tickets%rowtype;
begin
 select * into t from public.support_tickets where id=ticket for update;
 if not found or not public.is_owner() then raise exception 'forbidden'; end if;
 if new_status not in('open','closed') then raise exception 'invalid_status'; end if;
 update public.support_tickets set status=new_status,closed_at=case when new_status='closed' then now() else null end,updated_at=now() where id=ticket;
 insert into public.staff_action_log(actor_id,action,target_type,target_id,details) values(auth.uid(),'support_status_changed','support_ticket',ticket,jsonb_build_object('from',t.status,'to',new_status));
end $$;
revoke execute on function public.support_set_ticket_status(uuid,text) from public,anon;
grant execute on function public.support_set_ticket_status(uuid,text) to authenticated;

create or replace function public.support_assign_ticket(ticket uuid,staff_user uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.is_owner() then raise exception 'forbidden'; end if;
 if staff_user is not null and not (public.is_admin_role() or public.is_moderator() or public.is_owner()) then raise exception 'invalid_assignee'; end if;
 update public.support_tickets set assigned_to=staff_user,updated_at=now() where id=ticket;
 if not found then raise exception 'ticket_not_found'; end if;
 insert into public.staff_action_log(actor_id,action,target_type,target_id,details) values(auth.uid(),'support_ticket_assigned','support_ticket',ticket,jsonb_build_object('assigned_to',staff_user));
end $$;
revoke execute on function public.support_assign_ticket(uuid,uuid) from public,anon;
grant execute on function public.support_assign_ticket(uuid,uuid) to authenticated;

create or replace function public.support_reopen_ticket(ticket uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.support_tickets where id=ticket and (user_id=auth.uid() or public.is_owner() or (public.is_admin_role() and category in('question','bug','other')))) then raise exception 'forbidden'; end if;
 update public.support_tickets set status='open',closed_at=null,updated_at=now() where id=ticket;
end $$;
revoke execute on function public.support_reopen_ticket(uuid) from public,anon;
grant execute on function public.support_reopen_ticket(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('support-attachments','support-attachments',false,15728640,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','audio/webm','audio/ogg','application/pdf'])
on conflict(id) do nothing;
create policy support_files_read on storage.objects for select to authenticated using(bucket_id='support-attachments' and public.support_can_access_ticket((storage.foldername(name))[1]::uuid));
create policy support_files_insert on storage.objects for insert to authenticated with check(bucket_id='support-attachments' and public.support_can_access_ticket((storage.foldername(name))[1]::uuid));
create policy support_files_delete on storage.objects for delete to authenticated using(bucket_id='support-attachments' and (public.is_owner() or (public.support_can_access_ticket((storage.foldername(name))[1]::uuid) and auth.uid()::text=(storage.foldername(name))[2])));

do $$ begin
 begin alter publication supabase_realtime add table public.support_tickets; exception when duplicate_object then null; end;
 begin alter publication supabase_realtime add table public.support_messages; exception when duplicate_object then null; end;
end $$;
