drop function if exists public.support_send_message(uuid,text,boolean);
create or replace function public.support_send_message(
 ticket uuid,message_body text,internal_note boolean default false,
 file_path text default null,file_name text default null,file_type text default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare t public.support_tickets%rowtype; new_id uuid;
begin
 select * into t from public.support_tickets where id=ticket for update;
 if not found then raise exception 'ticket_not_found'; end if;
 if t.user_id=auth.uid() then if internal_note then raise exception 'forbidden'; end if;
 elsif not public.support_staff_can_access(t.category) then raise exception 'forbidden'; end if;
 if t.status='closed' and not public.is_owner() then raise exception 'ticket_closed'; end if;
 if length(trim(coalesce(message_body,'')))=0 and file_path is null then raise exception 'message_or_attachment_required'; end if;
 if file_path is not null and split_part(file_path,'/',1)<>ticket::text then raise exception 'invalid_attachment_path'; end if;
 insert into public.support_messages(ticket_id,sender_id,body,is_internal,attachment_path,attachment_name,attachment_type)
 values(ticket,auth.uid(),left(trim(coalesce(message_body,'')),5000),internal_note,file_path,file_name,file_type) returning id into new_id;
 update public.support_tickets set updated_at=now() where id=ticket;
 if internal_note then insert into public.support_internal_notes(ticket_id,author_id,body) values(ticket,auth.uid(),left(trim(message_body),5000)); end if;
 insert into public.staff_action_log(actor_id,action,target_type,target_id,details) values(auth.uid(),case when internal_note then 'support_internal_note' else 'support_message_sent' end,'support_ticket',ticket,jsonb_build_object('message_id',new_id,'has_attachment',file_path is not null));
 return new_id;
end $$;
revoke execute on function public.support_send_message(uuid,text,boolean,text,text,text) from public,anon;
grant execute on function public.support_send_message(uuid,text,boolean,text,text,text) to authenticated;
drop policy if exists post_media_insert on storage.objects;
create policy post_media_insert on storage.objects for insert to authenticated with check(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text and public.can_post() and not public.has_active_restriction(auth.uid(),'media'));
drop policy if exists voice_insert on storage.objects;
create policy voice_insert on storage.objects for insert to authenticated with check(bucket_id='voice' and (storage.foldername(name))[1]=auth.uid()::text and not public.has_active_restriction(auth.uid(),'media'));
