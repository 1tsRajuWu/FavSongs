# FavSongs backend (separate Supabase project — NOT Milo's)

One-time setup (owner does this in the dashboards; nothing here is secret):

1. **New project** — https://supabase.com/dashboard → New project
   (free tier is fine). Save the **Project URL** + **anon public key**.
2. **Schema** — SQL editor → paste `supabase/schema.sql` → Run.
   Verifies: `shelves` + `shelf_songs` tables, RLS on, 4 policies.
3. **Google auth** — Authentication → Providers → Google → ON.
   Needs a Google OAuth client: https://console.cloud.google.com/apis/credentials
   → Create OAuth client ID (Web application):
   - Authorized JavaScript origins: your Supabase project URL
     (Project Settings → API → Project URL).
   - Authorized redirect URI: copy the **Callback URL** shown on Supabase's
     Google provider page itself (ends in `/auth/v1/callback`).
   → paste the Google client ID + client secret into Supabase.
   ⚠️ The Google client secret lives ONLY in the Supabase dashboard —
   never in code, git, or chat. Whoever holds it can impersonate logins.
4. **Redirect URLs** — Authentication → URL Configuration → Redirect URLs:
   - `https://favsongs.pages.dev/`
   - `http://localhost:8124/` (local review only)
5. **Wire the site** — copy `supabase-config.example.js` to
   `supabase-config.js`, fill in URL + anon key. That file is gitignored
   and loaded by `index.html` before the app script.

Security model:
- The anon key is PUBLIC by design (it ships in the JS). All real
  enforcement is Row Level Security: every policy is scoped to
  `auth.uid()`, so a user can only ever read/write their own rows —
  plus read-only access to shelves flagged `is_public`.
- The `service_role` key must NEVER appear in this folder, in git, or in
  any secret except Supabase's own dashboard. The app never needs it.
- Share links (`#p=…`) stay fully client-side: no account needed to open
  someone's shelf, and nothing is uploaded when opening one.

Deploy (when ready): new Cloudflare Pages project `favsongs` pointed at
this folder (or ask to wire the `deploy-favsongs.yml` workflow), plus the
two redirect URLs above.

## Link previews (`/s?id=…`)

Chat apps fetch a shared link with plain HTTP and never run JavaScript, so
they can't read `shared_links` through the page. `functions/s.js` (a Pages
Function on `/s`, plus `/s.html` for links already in the wild) looks the
shelf up the same way the page does and rewrites the head with the real
`og:`/`twitter:` card — first song title and artist, song count, and the
first cover the shelf has (Apple Music covers are re-requested at 600×600).
With no cover it uses `/og-cover.png`, the 1200×630 card committed at the
repo root.

- The anon key is only ever read server-side from `env.SUPABASE_URL` /
  `env.SUPABASE_ANON_KEY` (Pages → Settings → Variables) or from the
  deployed `supabase-config.js` asset, and it never appears in the HTML.
- Anything that can't be checked — no credentials, Supabase down, or a
  timeout — serves the plain page with its generic card instead of claiming
  the shelf is missing. Only a real "no row" shows *Shared shelf not found*.
- Locally: `npx wrangler pages dev . --port 8790`, then
  `curl "http://127.0.0.1:8790/s?id=<id>"` and inspect the meta tags — a
  static server alone can't exercise a Function.
- Production deploys need `SUPABASE_URL` + `SUPABASE_ANON_KEY` as GitHub
  repo secrets; the workflow writes `supabase-config.js` from them (the file
  stays gitignored) so the page *and* the preview card read the same values.
- `shared_links` has no DELETE policy, so share rows can only be removed
  from the Supabase dashboard (Table editor) — worth a cleanup/expiry policy
  before the table grows forever.
