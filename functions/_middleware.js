/**
 * The one dynamic entry point on the site.
 *
 * A shared shelf is a short root link — favsongs.pages.dev/<id> — and the
 * older /s?id=… and /s.html?id=… forms still resolve here, so links already
 * pasted into a chat keep working. Chat apps, Slack, Discord and iMessage fetch
 * those links with plain HTTP and never run JavaScript, so the shelf is looked
 * up here and the head is rewritten with the real title, song count and first
 * cover as og:/twitter: tags. The static tags in s.html are already a sensible
 * generic card, so every failure path below passes the request along instead of
 * inventing a preview.
 *
 * Supabase credentials, in order of preference:
 *   1. env.SUPABASE_URL + env.SUPABASE_ANON_KEY (Pages → Settings → Variables)
 *   2. the deployed /supabase-config.js asset, the same public anon key the page
 *      itself uses — so previews keep working with zero dashboard setup.
 * The anon key is public by design; Row Level Security is what protects data.
 */

const ID_RE = /^[A-Za-z0-9_-]{6,12}$/;
// Page names that sit at the root; none of them is a shelf id.
const RESERVED = new Set(["", "index", "song", "s", "saved", "shelf", "legal"]);
const MAX_SONGS = 24;
const TIMEOUT_MS = 2500;
const FALLBACK_IMAGE = "/og-cover.png";
const FALLBACK_W = 1200;
const FALLBACK_H = 630;
const GENERIC_ALT = "FavSongs — keep the songs you love, share them as one link";

let configCache = null;

function cleanStr(value, max) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s·,-]+$/, "") + "…";
}

// Apple Music covers are served at any size: …/100x100bb.jpg → …/600x600bb.jpg.
// Never downscale, and leave every other CDN's URL alone.
function upgradeArt(url) {
  const m = url.match(/\/(\d+)x(\d+)([a-z]{2})\.(jpe?g|png|webp)(\?|$)/i);
  if (!m || Number(m[1]) >= 600) return url;
  return url.replace(m[0], "/600x600bb." + m[4] + (m[5] || ""));
}

async function supabaseConfig(env, request) {
  if (configCache) return configCache;
  const envUrl = cleanStr(env.SUPABASE_URL || env.FAVSONGS_SUPABASE_URL, 200);
  const envKey = cleanStr(env.SUPABASE_ANON_KEY || env.FAVSONGS_SUPABASE_ANON_KEY, 400);
  if (/^https:\/\//.test(envUrl) && envKey.length >= 20) {
    configCache = { url: envUrl.replace(/\/+$/, ""), key: envKey };
    return configCache;
  }
  try {
    const asset = await env.ASSETS.fetch(new URL("/supabase-config.js", request.url));
    if (!asset.ok) return null;
    const text = await asset.text();
    const url = text.match(/FAVSONGS_SUPABASE_URL\s*=\s*["']([^"']+)["']/);
    const key = text.match(/FAVSONGS_SUPABASE_ANON_KEY\s*=\s*["']([^"']+)["']/);
    if (!url || !key || !/^https:\/\//.test(url[1]) || key[1].length < 20) return null;
    configCache = { url: url[1].replace(/\/+$/, ""), key: key[1] };
    return configCache;
  } catch {
    return null; // asset missing — the generic card in s.html stands
  }
}

/** Songs for one short id, or null when we genuinely could not check. */
async function fetchSongs(config, id) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      config.url + "/rest/v1/shared_links?id=eq." + encodeURIComponent(id) + "&select=songs",
      {
        headers: { apikey: config.key, Authorization: "Bearer " + config.key, Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const raw = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].songs) ? rows[0].songs : [];
    const songs = [];
    for (const s of raw) {
      if (!s || typeof s.t !== "string" || !s.t.trim()) continue;
      const art = typeof s.art === "string" && s.art.startsWith("https://") ? s.art : "";
      songs.push({ t: cleanStr(s.t, 120), a: cleanStr(s.a, 120), art });
      if (songs.length === MAX_SONGS) break;
    }
    return songs; // [] means the row exists but holds no usable songs
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The shelf this request is asking for, or "" when it is a page or an asset. */
function requestedId(url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/s" || path === "/s.html") return url.searchParams.get("id") || "";
  const seg = path.split("/").filter(Boolean);
  // One bare segment with no file extension is a shelf link, even a malformed
  // one: the viewer says "link not found", which beats falling through to the
  // home page for a truncated or hand-typed link.
  if (seg.length === 1 && !RESERVED.has(seg[0]) && !seg[0].includes(".")) return seg[0];
  return "";
}

/** /<id>, /s?id= and /s.html?id= all render the same viewer page. */
function viewerRequest(request) {
  const url = new URL(request.url);
  url.pathname = "/s";
  url.search = "";
  return new Request(url.toString(), request);
}

function baseCard(origin, id) {
  return { url: origin + "/" + encodeURIComponent(id) };
}

function notFoundCard(origin, id) {
  return {
    ...baseCard(origin, id),
    pageTitle: "Shared shelf not found · FavSongs",
    ogTitle: "Shared shelf not found",
    description: "This shelf link is invalid or was removed. Build your own shelf of songs on FavSongs.",
    image: origin + FALLBACK_IMAGE,
    imageWidth: FALLBACK_W,
    imageHeight: FALLBACK_H,
    imageAlt: GENERIC_ALT,
  };
}

function shelfCard(songs, origin, id) {
  const count = songs.length;
  const lead = songs[0].a ? songs[0].t + " — " + songs[0].a : songs[0].t;
  const ogTitle = count === 1 ? lead : lead + ", and " + (count - 1) + " more song" + (count - 1 === 1 ? "" : "s");
  const names = songs
    .slice(0, 5)
    .map((s) => (s.a ? s.t + " — " + s.a : s.t))
    .join(" · ");
  const description = clip(
    count + " song" + (count === 1 ? "" : "s") + " shared with you · " + names,
    190,
  );
  const withArt = songs.find((s) => s.art);
  const card = {
    ...baseCard(origin, id),
    pageTitle: ogTitle + " · FavSongs",
    ogTitle,
    description,
    image: origin + FALLBACK_IMAGE,
    imageWidth: FALLBACK_W,
    imageHeight: FALLBACK_H,
    imageAlt: GENERIC_ALT,
  };
  if (withArt) {
    card.image = upgradeArt(withArt.art);
    // Size unknown on most CDNs — let each scraper measure the cover instead.
    card.imageWidth = null;
    card.imageHeight = null;
    card.imageAlt = "Cover art for " + withArt.t;
  }
  return card;
}

function withCard(asset, card) {
  const setContent = (value) =>
    value === null
      ? { element(el) { el.remove(); } }
      : { element(el) { el.setAttribute("content", value); } };
  const rewritten = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(card.pageTitle); } })
    .on('meta[name="description"]', setContent(card.description))
    .on('link[rel="canonical"]', { element(el) { el.setAttribute("href", card.url); } })
    .on('meta[property="og:title"]', setContent(card.ogTitle))
    .on('meta[property="og:description"]', setContent(card.description))
    .on('meta[property="og:url"]', setContent(card.url))
    .on('meta[property="og:image"]', setContent(card.image))
    .on('meta[property="og:image:width"]', setContent(card.imageWidth))
    .on('meta[property="og:image:height"]', setContent(card.imageHeight))
    .on('meta[property="og:image:alt"]', setContent(card.imageAlt))
    .on('meta[name="twitter:title"]', setContent(card.ogTitle))
    .on('meta[name="twitter:description"]', setContent(card.description))
    .on('meta[name="twitter:image"]', setContent(card.image))
    .transform(asset);
  const headers = new Headers(rewritten.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("cache-control", "public, max-age=300");
  return new Response(rewritten.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  if (request.method !== "GET" && request.method !== "HEAD") return next();

  const url = new URL(request.url);
  const id = requestedId(url);
  if (!id) return next(); // a real page or asset: let it through

  const asset = await env.ASSETS.fetch(viewerRequest(request));
  if (!asset.ok) return next(); // no viewer page deployed

  // An id that cannot exist needs no lookup; the viewer shows its error state
  // and the card says the same thing.
  if (!ID_RE.test(id)) return withCard(asset, notFoundCard(url.origin, id));

  const config = await supabaseConfig(env, request);
  if (!config) return asset; // no credentials yet: keep the generic static card

  const songs = await fetchSongs(config, id);
  if (songs === null) return asset; // could not check — never claim a shelf is missing
  if (!songs.length) return withCard(asset, notFoundCard(url.origin, id));

  return withCard(asset, shelfCard(songs, url.origin, id));
}
