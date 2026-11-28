
create or replace function public.has_active_restriction(target uuid,kind text)
returns boolean language plpgsql stable security definer set search_path=''
as $$
begin
 if target is distinct from auth.uid() and not public.is_owner() then return false; end if;
 return exists(select 1 from public.user_restrictions r where r.user_id=target and r.restriction_type=kind and r.revoked_at is null and r.expires_at>now());
end $$;
revoke execute on function public.has_active_restriction(uuid,text) from public,anon;
grant execute on function public.has_active_restriction(uuid,text) to authenticated;
