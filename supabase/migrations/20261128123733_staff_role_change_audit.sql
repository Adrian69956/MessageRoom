create or replace function public.log_app_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  before_role text;
  after_role text;
begin
  if tg_op = 'INSERT' then
    target_user := new.user_id;
    after_role := new.role;
  elsif tg_op = 'UPDATE' then
    target_user := new.user_id;
    before_role := old.role;
    after_role := new.role;
  else
    target_user := old.user_id;
    before_role := old.role;
  end if;

  insert into public.staff_action_log(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'role_changed', 'user', target_user,
    jsonb_build_object('from', before_role, 'to', after_role));

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists app_roles_audit on public.app_roles;
create trigger app_roles_audit
after insert or update or delete on public.app_roles
for each row execute function public.log_app_role_change();
