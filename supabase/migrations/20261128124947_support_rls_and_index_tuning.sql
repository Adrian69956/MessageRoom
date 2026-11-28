
create index if not exists support_internal_notes_ticket_created_idx on public.support_internal_notes(ticket_id,created_at);
drop policy if exists support_tickets_read on public.support_tickets;
create policy support_tickets_read on public.support_tickets for select to authenticated
using(user_id=(select auth.uid()) or (select public.support_staff_can_access(category)));
drop policy if exists user_warnings_read_self_or_owner on public.user_warnings;
create policy user_warnings_read_self_or_owner on public.user_warnings for select to authenticated
using(user_id=(select auth.uid()) or (select public.is_owner()));
drop policy if exists user_restrictions_read_self_or_owner on public.user_restrictions;
create policy user_restrictions_read_self_or_owner on public.user_restrictions for select to authenticated
using(user_id=(select auth.uid()) or (select public.is_owner()));
