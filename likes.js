/* FavSongs likes — heart button + count for any target.
 * Targets: { type: "link" | "song", id: string }.
 * Login-gated: signed-out clicks start Google sign-in; RLS (one row per
 * user per target) makes double-likes impossible even if tapped twice. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HEART =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

function cfg() {
  const u = window.FAVSONGS_SUPABASE_URL || "";
  const k = window.FAVSONGS_SUPABASE_ANON_KEY || "";
  if (!u.startsWith("https://") || u.includes("YOUR_NEW") || k.length < 20) return null;
  return { u, k };
}

export function songTargetId(title, artist) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
  return "song:" + norm(title) + "|" + norm(artist);
}

export async function mountLike(mountEl, target) {
  const c = cfg();
  if (!c || !mountEl) return;
  let sb;
  try {
    sb = createClient(c.u, c.k);
  } catch {
    return;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "like-btn";
  btn.setAttribute("aria-label", "Like this");
  btn.innerHTML = HEART + "<b>0</b>";
  mountEl.appendChild(btn);
  const countEl = btn.querySelector("b");

  async function refresh() {
    try {
      const { count } = await sb
        .from("shelf_likes")
        .select("*", { count: "exact", head: true })
        .eq("target_type", target.type)
        .eq("target_id", target.id);
      countEl.textContent = String(count || 0);
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return false;
      const { data: mine } = await sb
        .from("shelf_likes")
        .select("target_id")
        .eq("target_type", target.type)
        .eq("target_id", target.id)
        .eq("user_id", session.user.id)
        .maybeSingle();
      return !!mine;
    } catch {
      return false;
    }
  }

  let liked = await refresh();
  const paint = () => btn.classList.toggle("on", liked);
  paint();

  btn.addEventListener("click", async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + location.pathname + location.search },
      });
      return;
    }
    btn.disabled = true;
    try {
      if (liked) {
        await sb.from("shelf_likes").delete()
          .eq("target_type", target.type).eq("target_id", target.id).eq("user_id", session.user.id);
        liked = false;
      } else {
        const { error } = await sb.from("shelf_likes").insert({
          target_type: target.type, target_id: target.id, user_id: session.user.id,
        });
        if (!error) liked = true;
      }
      paint();
      const { count } = await sb.from("shelf_likes")
        .select("*", { count: "exact", head: true })
        .eq("target_type", target.type).eq("target_id", target.id);
      countEl.textContent = String(count || 0);
    } finally {
      btn.disabled = false;
    }
  });
}
