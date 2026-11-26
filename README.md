# MessageRoom

Веб-мессенджер на HTML/CSS/JavaScript с базой и сервером на [Supabase](https://supabase.com).

## Как устроено

- `index.html`, `style.css`, `script.js`, `auth.js` — сам сайт (без сборки, открывается в браузере).
- `supabase/` — SQL для базы. Файлы выполняются по порядку номеров в Supabase → SQL Editor.

## Публикация

Сайт публикуется через GitHub Pages из ветки `main` (Settings → Pages → Deploy from a branch → `main` / `root`).

## База данных

Файлы из `supabase/` выполняются по порядку в Supabase → SQL Editor:
`001_init.sql`, `002_usernames_pins_edit.sql`, `003_profile_fix.sql`, `004_admin.sql`.

## Рассылка (push и почта)

Функция `supabase/functions/admin-broadcast` создаётся в Supabase → Edge Functions.
Нужные секреты: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`.
Публичный VAPID-ключ также указан в `config.js`.
