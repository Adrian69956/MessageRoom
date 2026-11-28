
revoke execute on function public.handle_new_user() from public,anon,authenticated;

create index if not exists user_warnings_issued_by_idx on public.user_warnings(issued_by);
create index if not exists user_restrictions_created_by_idx on public.user_restrictions(created_by);
create index if not exists user_restrictions_revoked_by_idx on public.user_restrictions(revoked_by);
create index if not exists support_tickets_assigned_to_idx on public.support_tickets(assigned_to);
create index if not exists support_messages_sender_id_idx on public.support_messages(sender_id);
create index if not exists support_internal_notes_author_id_idx on public.support_internal_notes(author_id);
