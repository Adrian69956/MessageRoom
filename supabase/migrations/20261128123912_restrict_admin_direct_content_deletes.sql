drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts
  for delete to authenticated
  using (public.can_use() and (author_id = auth.uid() or public.is_owner()));

drop policy if exists comments_delete on public.post_comments;
create policy comments_delete on public.post_comments
  for delete to authenticated
  using (public.can_use() and (author_id = auth.uid() or public.is_owner()));
