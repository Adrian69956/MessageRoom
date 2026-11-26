# MessageRoom

Веб-мессенджер на HTML/CSS/JavaScript с базой и сервером на [Supabase](https://supabase.com).

## Как устроено

- `index.html`, `style.css`, `script.js`, `auth.js` — сам сайт (без сборки, открывается в браузере).
- `supabase/` — SQL для базы. Файлы выполняются по порядку номеров в Supabase → SQL Editor.

## Публикация

Сайт публикуется через GitHub Pages из ветки `main` (Settings → Pages → Deploy from a branch → `main` / `root`).
