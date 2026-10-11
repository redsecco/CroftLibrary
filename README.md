# Croft Library

A personal PWA for tracking authors and the books they've written, marking which you own.
Book data comes from the [Open Library API](https://openlibrary.org/developers/api) (free, no key).

- Add an author by name, pick from the matches.
- Mark books as owned; filter All / Owned / Missing.
- Author data is re-fetched when it is more than 7 days old (checked each time the app opens), or on demand via ⚙ Settings → Refresh all books now. New books get a "new" badge.
- Data lives in the phone's `localStorage`. Use **Export backup** occasionally.
- No build step, no dependencies: plain HTML/CSS/ES modules.

## Run locally

Any static server works, e.g. `npx serve .` or `python -m http.server`. Service workers need `localhost` or HTTPS.

## Deploy (GitHub Pages)

Push to GitHub, then Settings → Pages → deploy from `main` / root. On the iPhone open the URL in Safari,
Share → Add to Home Screen. Bump `VERSION` in `sw.js` when you ship changes so the cache refreshes.
