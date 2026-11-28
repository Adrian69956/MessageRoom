drop function if exists public.admin_set_restriction(uuid,text,integer,text);
create function public.admin_set_restriction(target uuid,kind text,duration_hours integer,restriction_reason text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare new_id uuid;
begin
 if not(public.is_owner() or public.is_admin_role()) then raise exception 'forbidden'; end if;
 if kind not in('posts','comments','media') then raise exception 'invalid_restriction'; end if;
 if duration_hours<1 or duration_hours>24 then raise exception 'duration_must_be_1_to_24_hours'; end if;
 if target=auth.uid() or exists(select 1 from public.app_admins where user_id=target) or exists(select 1 from public.app_roles where user_id=target) then raise exception 'cannot_restrict_staff'; end if;
 if nullif(trim(restriction_reason),'') is null then raise exception 'reason_required'; end if;
 insert into public.user_restrictions(user_id,restriction_type,reason,created_by,expires_at) values(target,kind,trim(restriction_reason),auth.uid(),now()+make_interval(hours=>duration_hours)) returning id into new_id;
 insert into public.staff_action_log(actor_id,action,target_type,target_id,details) values(auth.uid(),'restriction_issued','user',target,jsonb_build_object('restriction_id',new_id,'type',kind,'hours',duration_hours,'reason',trim(restriction_reason)));
 return new_id;
end $$;
revoke execute on function public.admin_set_restriction(uuid,text,integer,text) from public,anon;
grant execute on function public.admin_set_restriction(uuid,text,integer,text) to authenticated;
