create or replace function public.log_moderated_content_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderation_reason text := current_setting('app.moderation_reason', true);
begin
  if auth.uid() is not null and old.author_id <> auth.uid() and public.can_moderate_content() then
    insert into public.staff_action_log(actor_id, action, target_type, target_id, details)
    values (
      auth.uid(), tg_table_name || '_deleted', tg_table_name, old.id,
      jsonb_build_object(
        'author_id', old.author_id,
        'text', left(coalesce(old.text, ''), 500),
        'reason', nullif(moderation_reason, '')
      )
    );
  end if;
  return old;
end;
$$;

create or replace function public.staff_delete_post(target uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_moderate_content() then raise exception 'forbidden'; end if;
  if nullif(trim(reason), '') is null then raise exception 'reason_required'; end if;
  perform set_config('app.moderation_reason', trim(reason), true);
  delete from public.posts where id = target and author_id <> auth.uid();
  if not found then raise exception 'post_not_found_or_not_allowed'; end if;
end;
$$;

create or replace function public.staff_delete_comment(target uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_moderate_content() then raise exception 'forbidden'; end if;
  if nullif(trim(reason), '') is null then raise exception 'reason_required'; end if;
  perform set_config('app.moderation_reason', trim(reason), true);
  delete from public.post_comments where id = target and author_id <> auth.uid();
  if not found then raise exception 'comment_not_found_or_not_allowed'; end if;
end;
$$;

revoke execute on function public.staff_delete_post(uuid, text) from public, anon;
grant execute on function public.staff_delete_post(uuid, text) to authenticated;
revoke execute on function public.staff_delete_comment(uuid, text) from public, anon;
grant execute on function public.staff_delete_comment(uuid, text) to authenticated;
