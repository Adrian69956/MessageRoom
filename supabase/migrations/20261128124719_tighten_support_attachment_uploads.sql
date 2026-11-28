
update storage.buckets
set allowed_mime_types=array[
 'image/jpeg','image/png','image/webp','image/gif','image/heic',
 'video/mp4','video/webm','video/quicktime',
 'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/wav',
 'application/pdf'
]
where id='support-attachments';

drop policy if exists support_files_insert on storage.objects;
create policy support_files_insert on storage.objects for insert to authenticated
with check(
 bucket_id='support-attachments'
 and public.support_can_access_ticket((storage.foldername(name))[1]::uuid)
 and (storage.foldername(name))[2]=auth.uid()::text
);
