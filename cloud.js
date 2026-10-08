// Cloud shelves (Supabase + Google auth). Entirely optional: without
// supabase-config.js the page is a fully working local shelf app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const B = window.FavShelf;
const authArea = document.getElementById("authArea");
const URL = window.FAVSONGS_SUPABASE_URL || "";
const KEY = window.FAVSONGS_SUPABASE_ANON_KEY || "";
const configured = URL.startsWith("https://") && !URL.includes("YOUR_NEW") && KEY.length > 20;

/* One line beside the shelf that says which side of the gate you are on.
 *
 * Everything cloud — sync, publishing to Discover, a shelf that follows you
 * between devices — needs the Google account, and the account is the only thing
 * that needs it: the shelf in this browser and every link somebody was sent stay
 * open. The line is created here so every page with a cloud area gets it without
 * repeating the markup. */
function cloudNote(text) {
  const wrap = document.querySelector(".toggles");
  if (!wrap) return;
  let el = document.getElementById("cloudNote");
  if (!el) {
    el = document.createElement("span");
    el.id = "cloudNote";
    el.className = "fav-hint";
    wrap.appendChild(el);
  }
  el.textContent = text || "";
  el.hidden = !text;
}

function authBtn(label, fn, primary) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-sm" + (primary ? " btn-primary" : "");
  b.textContent = label;
  b.addEventListener("click", fn);
  authArea.innerHTML = "";
  authArea.appendChild(b);
}

if (!configured) {
  const s = document.createElement("span");
  s.className = "fav-hint";
  s.textContent = "Local shelf";
  s.title = "Add supabase-config.js to enable Google sign-in + cloud sync";
  authArea.appendChild(s);
} else {
  const sb = createClient(URL, KEY);
  const keyOf = (s) => ((s.t || "") + "|||" + (s.a || "")).toLowerCase();

  async function myShelfRow(userId) {
    const { data } = await sb.from("shelves").select("id,title,is_public").eq("user_id", userId).maybeSingle();
    if (data) return data;
    const { data: created, error } = await sb.from("shelves").insert({ user_id: userId, title: "My shelf" }).select("id,title,is_public").single();
    if (error) throw error;
    return created;
  }
  async function cloudSongs(shelfId) {
    const { data, error } = await sb.from("shelf_songs").select("id,title,artist,album,art,url").eq("shelf_id", shelfId).order("position");
    if (error) throw error;
    return (data || []).map((r) => ({ id: r.id, t: r.title, a: r.artist || "", al: r.album || "", art: r.art || "", u: r.url || "" }));
  }
  async function merge() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return false;
    const row = await myShelfRow(session.user.id);
    const cloud = await cloudSongs(row.id);
    const local = B.loadShelf();
    const have = new Set(cloud.map(keyOf));
    const missing = local.filter((s) => !have.has(keyOf(s)));
    if (missing.length) {
      await sb.from("shelf_songs").insert(missing.map((s, i) => ({
        shelf_id: row.id, title: s.t, artist: s.a || "", album: s.al || "",
        art: s.art || "", url: s.u || "", position: cloud.length + i,
      })));
    }
    const fresh = await cloudSongs(row.id);
    B.saveShelf(fresh.map((s) => ({ ...s })));
    B.render();
    const tgl = document.getElementById("publicToggle");
    const pwrap = document.getElementById("publicWrap");
    if (tgl && pwrap) {
      tgl.checked = !!row.is_public;
      pwrap.hidden = false;
    }
    const syncB = document.getElementById("syncBtn");
    if (syncB) syncB.hidden = false;
    return true;
  }

  // Reload only on real transitions — INITIAL_SESSION also fires here,
  // so a blind reload would loop forever.
  let bootedUid = null;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      bootedUid = null;
      const syncB = document.getElementById("syncBtn");
      if (syncB) syncB.hidden = true;
      const pwrap = document.getElementById("publicWrap");
      if (pwrap) pwrap.hidden = true;
      bootSession(null);
    } else if (event === "SIGNED_IN" && session) {
      bootSession(session);
    }
  });
  sb.auth.getSession().then(async ({ data: { session } }) => {
    bootSession(session);
  });
  async function bootSession(session) {
    if (!session) {
      authBtn("Sign in with Google", () => {
        sb.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: location.origin + location.pathname },
        });
      }, true);
      cloudNote("Signed out — sign in with Google to sync this shelf across devices or list it in Discover. Sharing a link and opening one never need an account.");
      loadDiscover();
      return;
    }
    if (bootedUid === session.user.id) return;
    bootedUid = session.user.id;
    const meta = session.user.user_metadata || {};
    const name = meta.full_name || meta.name || session.user.email || "you";
    const avatar = meta.avatar_url || meta.picture || "";
    // Record the login (display details only — email never leaves auth.users).
    sb.from("profiles").upsert({
      id: session.user.id,
      display_name: String(name).slice(0, 80),
      avatar_url: String(avatar).slice(0, 500),
      last_sign_in_at: new Date().toISOString(),
    }, { onConflict: "id" }).then(() => {}, () => {});
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-sm";
    b.title = "Signed in as " + name + " — click to sign out";
    b.style.display = "inline-flex";
    b.style.alignItems = "center";
    b.style.gap = "0.45rem";
    if (avatar) {
      const img = document.createElement("img");
      img.src = avatar;
      img.alt = "";
      img.width = 20;
      img.height = 20;
      img.style.borderRadius = "50%";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => img.remove();
      b.appendChild(img);
    }
    const label = document.createElement("span");
    label.textContent = String(name).split(" ")[0];
    b.appendChild(label);
    b.addEventListener("click", async () => {
      if (confirm("Sign out of FavSongs?")) await sb.auth.signOut();
    });
    authArea.innerHTML = "";
    authArea.appendChild(b);
    cloudNote("Signed in as " + String(name).split(" ")[0] + " — this shelf is on your account and Discover is on. Click your name above to sign out.");
    try {
      await merge();
    } catch (e) {
      console.warn("cloud sync failed", e);
    }
    loadDiscover();

    const syncB2 = document.getElementById("syncBtn");
    if (syncB2) {
      syncB2.addEventListener("click", async () => {
        try { await merge(); } catch (e) { console.warn(e); }
      });
    }
    const tgl = document.getElementById("publicToggle");
    if (tgl) {
      tgl.addEventListener("change", async () => {
        const { data: { session: s2 } } = await sb.auth.getSession();
        // An expired session used to leave the box ticked with nothing saved:
        // put the box back and say why.
        if (!s2) {
          tgl.checked = !tgl.checked;
          cloudNote("Signed out — sign in with Google again to publish this shelf.");
          return;
        }
        const row = await myShelfRow(s2.user.id);
        const { error } = await sb.from("shelves").update({ is_public: tgl.checked }).eq("id", row.id);
        if (error) {
          tgl.checked = !tgl.checked;
          cloudNote("Could not change that — nothing was published. Try again in a moment.");
          return;
        }
        cloudNote(tgl.checked
          ? "Listed — this shelf shows up in Discover for anyone browsing."
          : "Unlisted — the shelf is yours again. A link you already sent still works.");
        loadDiscover();
      });
    }
  }

  async function loadDiscover() {
    try {
      const { data, error } = await sb
        .from("shelves")
        .select("id,title,updated_at,user_id,shelf_songs(count)")
        .eq("is_public", true)
        .order("updated_at", { ascending: false })
        .limit(12);
      if (error || !data || !data.length) return;
      // Owner display names (public profiles only — no emails involved).
      let names = {};
      try {
        const ids = [...new Set(data.map((r) => r.user_id).filter(Boolean))];
        if (ids.length) {
          const { data: profs } = await sb.from("profiles").select("id,display_name").in("id", ids);
          for (const p of profs || []) names[p.id] = p.display_name || "music fan";
        }
      } catch { /* names stay blank */ }
      const sec = document.getElementById("discover");
      const grid = document.getElementById("discoverGrid");
      if (!sec || !grid) return;
      grid.innerHTML = "";
      sec.hidden = false;
      for (const row of data) {
        const n = (row.shelf_songs && row.shelf_songs[0] && row.shelf_songs[0].count) || 0;
        const owner = names[row.user_id] ? " · by " + names[row.user_id] : "";
        const card = document.createElement("button");
        card.type = "button";
        card.className = "song-card";
        card.style.cursor = "pointer";
        const t = document.createElement("div");
        t.className = "t";
        const b = document.createElement("b");
        b.textContent = row.title || "Untitled shelf";
        const sp = document.createElement("span");
        const when = row.updated_at ? new Date(row.updated_at).toLocaleDateString() : "";
        sp.textContent = n + " song" + (n === 1 ? "" : "s") + owner + (when ? " · " + when : "");
        t.appendChild(b);
        t.appendChild(sp);
        card.appendChild(t);
        card.addEventListener("click", async () => {
          const songs = await cloudSongs(row.id);
          if (!songs.length) return;
          const p = btoa(unescape(encodeURIComponent(JSON.stringify(
            songs.map((s) => ({ t: s.t, a: s.a, al: s.al, art: s.art, u: s.u })),
          )))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          location.hash = "#p=" + p;
          location.reload();
        });
        grid.appendChild(card);
      }
    } catch (e) {
      console.warn("discover failed", e);
    }
  }
}