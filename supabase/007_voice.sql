-- ===== Этап 5: голосовые сообщения в чатах и постах =====

-- ---------- 1. Хранилище для аудио ----------
-- Приватное: ссылка выдаётся только вошедшему пользователю и живёт час.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice', 'voice', false, 5242880,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do nothing;

drop policy if exists voice_insert on storage.objects;
create policy voice_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'voice' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists voice_select on storage.objects;
create policy voice_select on storage.objects
  for select to authenticated
  using (bucket_id = 'voice');

drop policy if exists voice_delete on storage.objects;
create policy voice_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'voice' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 2. Сообщения: текст стал необязательным, добавилось аудио ----------
alter table public.messages alter column text drop not null;
alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_text_check
  check (text is null or char_length(text) between 1 and 4000);

alter table public.messages add column if not exists voice_path text;
alter table public.messages add column if not exists voice_ms integer;

alter table public.messages drop constraint if exists messages_voice_path_len;
alter table public.messages add constraint messages_voice_path_len
  check (voice_path is null or char_length(voice_path) <= 300);

-- В сообщении должно быть хоть что-то: текст или голос
alter table public.messages drop constraint if exists messages_has_content;
alter table public.messages add constraint messages_has_content
  check (text is not null or voice_path is not null);

-- ---------- 3. Посты: то же самое ----------
alter table public.posts alter column text drop not null;
alter table public.posts drop constraint if exists posts_text_check;
alter table public.posts add constraint posts_text_check
  check (text is null or char_length(text) between 1 and 4000);

alter table public.posts add column if not exists voice_path text;
alter table public.posts add column if not exists voice_ms integer;

alter table public.posts drop constraint if exists posts_has_content;
alter table public.posts add constraint posts_has_content
  check (text is not null or voice_path is not null);
