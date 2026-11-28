
drop policy if exists post_reports_insert_self on public.post_reports;
create policy post_reports_insert_self on public.post_reports
for insert to authenticated
with check(
 reporter_id=(select auth.uid())
 and public.can_use()
 and exists(select 1 from public.posts p where p.id=post_id and p.author_id<>(select auth.uid()))
 and priority=public.is_moderator()
);
