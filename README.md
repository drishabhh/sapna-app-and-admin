# Sapna app + admin

- `app/` — Android app (Capacitor + React). All of her data stays on her phone.
- `admin/` — admin web page (opens at `/admin/` on GitHub Pages) for editing plans, exercises, foods and targets.
- `content/content.json` — the feed the app fetches; the admin page publishes here.
- `media/`, `data/gif-library.json` — exercise GIFs and their library.
- `.github/workflows/android-apk.yml` — builds an unsigned APK (sign it offline with your own keystore).

No personal logs or keystores belong in this repo.
