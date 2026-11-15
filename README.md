# IYS Website

The public IYS site — a hand-written static website with accounts, product pages, and a few browser toys. No framework and no build step: plain HTML, CSS and JavaScript, served straight from a folder. Accounts, profiles and leaderboards live in Supabase.

![HTML](https://img.shields.io/badge/HTML-5-orange) ![CSS](https://img.shields.io/badge/CSS-3-blue) ![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-yellow) ![Supabase](https://img.shields.io/badge/Supabase-auth%20%2B%20database-3ECF8E) ![Hosted on GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-black)

## Pages

| Page | What it is |
|---|---|
| `index.html` | Home — what IYS is, and links to everything else |
| `IYM.html` | IYM division page (software tools) |
| `IYS Software.html` | IYS PDF, in development for macOS |
| `IYS Studio.html` | Studio work |
| `IYS Website.html` | Index of the things on this site |
| `IYS Arcade.html` | Seven browser benchmarks — reaction, click, typing, number memory, sequence memory, aim, draw-a-circle |
| `IYS Critters.html` | Teaser page for a creature-raising game, not released yet |
| `IYM AutoClicker Pro.html`, `IYM AutoClicker Pro - buy.html` | AutoClicker product and purchase pages |
| `IYS Account Sign In.html`, `IYS Account Sign Up.html`, `IYS Account Reset Password.html` | Account pages |
| `terms.html`, `privacy.html`, `refund.html` | Policies (each product has its own variants) |

`IYS Human Benchmark.html` is a redirect stub. The benchmark page was renamed to `IYS Arcade.html`; the old URL forwards to the new one and keeps the `#hash` and query string, so shared links still work.

## Features

| Feature | Description |
|---|---|
| Accounts | Sign up, sign in, password reset and email confirmation through Supabase Auth |
| Email check on blur | The sign-up form asks the database whether an email is already registered as soon as the field loses focus |
| Unique usernames | Stored in `public.profiles`, enforced by a unique index on `lower(username)` |
| Avatars | Cropped and zoomed in the browser, uploaded to Supabase Storage, shown in the site navigation |
| Leaderboards | One row per user per test (their best), top 100, ties share a rank and ranks do not skip (1, 1, 1, 2, 2, 3) |
| My scores | Full personal history, newest first, with a free-text search that understands dates written any way (`2012.8.15`, `2012-08`) |
| Navigation avatar | A small dialog in the header for account settings, avatar and sign-out |

## Requirements

Nothing for the site itself — any static file server will do.

The optional Node server in `server/` needs **Node.js 22.13 or later** (24 recommended), because it uses the built-in `node:sqlite`.

## Run locally

Serve this folder with any static server and open it in a browser:

```bash
python3 -m http.server 8899
# then open http://127.0.0.1:8899/index.html
```

`file://` works for most pages, but sign-in and the leaderboard need a real origin, so use a local server when testing accounts.

### Optional: the bundled Node server

`server/` can serve this site and provide its own account API instead of Supabase:

```bash
cd server
npm install
npm start          # or: npm run dev, to reload on change
```

It listens on <http://127.0.0.1:3000>, serves the static site from the parent folder, and exposes `GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login` and the rest of the session endpoints under `/api/auth`. Data is kept in `server/data/iys.db`, created on first start.

See [server/README.md](server/README.md) for the API and data model.

## Deployment

The site is published with **GitHub Pages** from the repository root: push to `main` and it is live about forty seconds later. The CDN caches pages for around ten minutes, so hard-refresh (⌘⇧R) after a deploy when checking changes.

`Dockerfile` and `render.yaml` describe the optional Render deployment of the Node server (same static files, plus the `/api` routes). `DEPLOYMENT.md` walks through it.

## Supabase setup

The browser talks to Supabase directly with the publishable key in `supabase-config.js`. Run the SQL in `supabase/` once, in this order, in the Supabase SQL editor:

| File | Creates |
|---|---|
| `profiles.sql` | `public.profiles` — usernames, unique per lower-cased name |
| `avatars.sql` | Storage bucket and policies for avatars |
| `benchmark_scores.sql` | `public.benchmark_scores` — one row per finished run |
| `add_benchmark_tests.sql`, `add_circle_test.sql` | Widens the allowed `test` values |
| `backfill_leaderboard.sql` | Fills the leaderboard from older `user_metadata` scores |
| `email_exists.sql` | `public.email_exists(text)` — a SECURITY DEFINER function used by the sign-up form |

Email confirmation depends on Supabase's own mail settings; the confirmation code is eight digits and is entered on the sign-up page.

## Project structure

```
*.html                  Pages, one file each
style.css               The whole design system: tokens, layout, components
supabase.js             Supabase client setup and session helpers
supabase-config.js      Project URL and publishable key
account.js              Sign up, sign in, password reset, validation
account-nav.js          Header avatar, account dialog, avatar cropping
benchmark.js            The seven Arcade tests, leaderboards and history
supabase/               SQL migrations and helper functions
server/                 Optional Node + Express + SQLite account API
  src/auth/             Register, login, sessions, rate limiting
  src/lib/              Cookies, validation, error handling
Dockerfile, render.yaml Optional container deployment
DEPLOYMENT.md           Deployment notes
```

## How the Arcade scores work

- Every finished run writes a row to `benchmark_scores` with the test name, the value and a small `detail` object (accuracy, duration, display name).
- The leaderboard reads the best row per user, then ranks by score — ascending for reaction and aim (lower is better), descending for everything else.
- Ties are compared on the **displayed** value, so two people showing `180 ms` always share a rank.
- Logged-out play still works; scores just are not saved.

## Known limitations

- The site has no build step and no bundler, so `benchmark.js` and `style.css` are cached by URL. Bump the `?v=` query when changing them.
- The Supabase publishable key is public by design; row-level security policies do the actual access control.
- `IYS Critters` is a teaser only. The playable prototype is not in this repository.
- Transactional email is configured outside this repository and can land in spam depending on the recipient's provider.

## License

© IYS. All rights reserved. The site's text, artwork and code are not licensed for reuse.
