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
