// FavSongs Supabase config — PUBLIC anon key only (safe to ship).
// 1. Create a NEW project at https://supabase.com/dashboard (NOT the Milo one).
// 2. SQL editor → paste supabase/schema.sql → Run.
// 3. Authentication → Providers → enable Google (needs a Google OAuth client;
//    add redirect URLs below first, then paste the client ID + secret).
// 4. Authentication → URL Configuration → add redirect URLs:
//      https://favsongs.pages.dev/
//      http://localhost:8124/
// 5. Project Settings → API → copy URL + anon public key below.
window.FAVSONGS_SUPABASE_URL = "https://YOUR_NEW_PROJECT_REF.supabase.co";
window.FAVSONGS_SUPABASE_ANON_KEY = "YOUR_NEW_SUPABASE_ANON_KEY";
