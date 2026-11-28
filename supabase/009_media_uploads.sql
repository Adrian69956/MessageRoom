-- Media uploads for chat messages and feed posts
-- Buckets are private; access is granted through Storage RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
 ('chat-media','chat-media',false,26214400,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']),
 ('post-media','post-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set
 file_size_limit = excluded.file_size_limit,
 allowed_mime_types = excluded.allowed_mime_types;

alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_type text;
alter table public.messages add column if not exists media_mime text;
alter table public.messages add column if not exists media_size bigint;
alter table public.messages add column if not exists media_duration_ms integer;

alter table public.messages drop constraint if exists messages_has_content;
alter table public.messages add constraint messages_has_content
 check (text is not null or voice_path is not null or media_path is not null);
alter table public.messages drop constraint if exists messages_media_type_check;
alter table public.messages add constraint messages_media_type_check
 check (media_type is null or media_type in ('image','video'));
alter table public.messages drop constraint if exists messages_media_path_length;
alter table public.messages add constraint messages_media_path_length
 check (media_path is null or char_length(media_path) <= 500);
alter table public.messages drop constraint if exists messages_media_pair_check;
alter table public.messages add constraint messages_media_pair_check
 check ((media_path is null and media_type is null) or (media_path is not null and media_type is not null));
alter table public.messages drop constraint if exists messages_media_mime_check;
alter table public.messages add constraint messages_media_mime_check
 check (media_type is null or (media_type = 'image' and media_mime like 'image/%') or (media_type = 'video' and media_mime like 'video/%'));

alter table public.posts add column if not exists media_path text;
alter table public.posts add column if not exists media_type text;
alter table public.posts add column if not exists media_mime text;
alter table public.posts add column if not exists media_size bigint;
alter table public.posts add column if not exists media_duration_ms integer;

alter table public.posts drop constraint if exists posts_has_content;
alter table public.posts add constraint posts_has_content
 check (text is not null or voice_path is not null or media_path is not null);
alter table public.posts drop constraint if exists posts_media_type_check;
alter table public.posts add constraint posts_media_type_check
 check (media_type is null or media_type in ('image','video'));
alter table public.posts drop constraint if exists posts_media_path_length;
alter table public.posts add constraint posts_media_path_length
 check (media_path is null or char_length(media_path) <= 500);
alter table public.posts drop constraint if exists posts_video_duration_limit;
alter table public.posts add constraint posts_video_duration_limit
 check (media_type is distinct from 'video' or (media_duration_ms between 1 and 60000));
alter table public.posts drop constraint if exists posts_media_pair_check;
alter table public.posts add constraint posts_media_pair_check
 check ((media_path is null and media_type is null) or (media_path is not null and media_type is not null));
alter table public.posts drop constraint if exists posts_media_mime_check;
alter table public.posts add constraint posts_media_mime_check
 check (media_type is null or (media_type = 'image' and media_mime like 'image/%') or (media_type = 'video' and media_mime like 'video/%'));

drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects for insert to authenticated
 with check (bucket_id = 'chat-media'
   and (storage.foldername(name))[2] = auth.uid()::text
   and public.is_chat_member(((storage.foldername(name))[1])::uuid));
drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects for select to authenticated
 using (bucket_id = 'chat-media'
   and public.is_chat_member(((storage.foldername(name))[1])::uuid));
drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects for delete to authenticated
 using (bucket_id = 'chat-media'
   and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists post_media_insert on storage.objects;
create policy post_media_insert on storage.objects for insert to authenticated
 with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
   and public.can_post());
drop policy if exists post_media_select on storage.objects;
create policy post_media_select on storage.objects for select to authenticated
 using (bucket_id = 'post-media' and public.can_use());
drop policy if exists post_media_delete on storage.objects;
create policy post_media_delete on storage.objects for delete to authenticated
 using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
