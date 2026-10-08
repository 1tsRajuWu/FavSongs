/* Shared chart helpers — geo detection, Apple + Deezer charts merged by
 * reciprocal-rank fusion, devotional / AI / metadata-spam filtered out.
 * No keys, no backend. Used by index.html and explore.html. */
(() => {
  "use strict";

  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // Devotional markers (compound/clear terms only — bare "mantra" also names
  // pop songs, so it stays OUT). Gospel counts as religious per request.
  const DEVOTIONAL = [
    /bhajan/i, /aarti/i, /kirtan/i, /qawwali/i, /\bnaat\b/i, /chalisa/i,
    /shabad/i, /gurbani/i, /nasheed/i, /gospel/i, /devotional/i,
    /stuti/i, /stotra/i, /bhakti/i, /shloka/i, /katha\b/i,
  ];
  // AI slop: explicitly AI-labeled tracks/covers.
  const AI_SPAM = [
    /ai\s*(cover|version|remix|song|music|generated|voice)/i,
    /\(ai\)/i, /\[ai\]/i, /suno/i,
  ];
  // Metadata spam: karaoke/instrumental/slowed-type uploads, ringtones.
  const META_SPAM = [
    /karaoke/i, /instrumental/i, /slowed/i, /sped\s*up/i,
    /8d(\s*audio)?/i, /nightcore/i, /ringtone/i, /lullaby/i,
  ];

  function chartOk(title, artist, genre) {
    const s = (title || "") + " " + (artist || "");
    if (DEVOTIONAL.some((r) => r.test(s))) return false;
    if (AI_SPAM.some((r) => r.test(s))) return false;
    if (META_SPAM.some((r) => r.test(s))) return false;
    if (/devotional|gospel|religious/i.test(genre || "")) return false;
    return true;
  }

  function genreOf(entry) {
    try {
      const c = entry.category;
      const list = Array.isArray(c) ? c : [c];
      return list.map((x) => (x && x.attributes && x.attributes.label) || "").join(" ");
    } catch {
      return "";
    }
  }

  // Country via ipapi (accurate client geo) with Cloudflare trace as
  // fallback. Cloudflare's loc sometimes reports the edge colo instead of
  // the visitor (notably behind VPNs), so trace is only plan B.
  // A manual pick (country picker UI) always wins and persists.
  let countryCache = null;
  async function detectCountry() {
    if (countryCache) return countryCache;
    try {
      const raw = sessionStorage.getItem("favsongs.cc");
      if (raw && /^[a-z]{2}$/.test(raw)) {
        countryCache = raw;
        return raw;
      }
    } catch { /* private mode */ }
    try {
      const saved = localStorage.getItem("favsongs.cc.override");
      if (saved && /^[a-z]{2}$/.test(saved)) {
        countryCache = saved;
        return saved;
      }
    } catch { /* private mode */ }
    countryCache = (await detectCountryFresh()) || "us";
    return countryCache;
  }

  // Fresh detection without touching any cache (for the picker preview).
  async function detectCountryFresh() {
    try {
      const r = await fetch("https://ipapi.co/json/");
      if (r.ok) {
        const d = await r.json();
        const cc = String(d && d.country_code ? d.country_code : "").toLowerCase();
        if (/^[a-z]{2}$/.test(cc)) {
          rememberCountry(cc);
          return cc;
        }
      }
    } catch { /* blocked/offline */ }
    try {
      const r = await fetch("https://www.cloudflare.com/cdn-cgi/trace");
      const t = await r.text();
      const m = t.match(/loc=([A-Z]{2})/);
      const cc = (m ? m[1] : "US").toLowerCase();
      if (/^[a-z]{2}$/.test(cc)) {
        rememberCountry(cc);
        return cc;
      }
    } catch { /* blocked/offline */ }
    return "us";
  }

  function rememberCountry(cc) {
    try {
      sessionStorage.setItem("favsongs.cc", cc);
    } catch { /* private mode */ }
  }

  function setCountryOverride(cc) {
    cc = String(cc || "").toLowerCase();
    if (!/^[a-z]{2}$/.test(cc)) return false;
    try {
      localStorage.setItem("favsongs.cc.override", cc);
      sessionStorage.setItem("favsongs.cc", cc);
    } catch { /* private mode */ }
    countryCache = cc;
    return true;
  }

  function clearCountryOverride() {
    try {
      localStorage.removeItem("favsongs.cc.override");
      sessionStorage.removeItem("favsongs.cc");
    } catch { /* private mode */ }
    countryCache = null;
  }

  function cacheGet(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || Date.now() - o.at > 3600e3) return null;
      return o.items;
    } catch {
      return null;
    }
  }
  function cacheSet(key, items) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), items }));
    } catch { /* private mode */ }
  }

  async function fetchAppleChart(cc) {
    const key = "favsongs.chart.apple." + cc;
    const hit = cacheGet(key);
    if (hit) return hit;
    const r = await fetch("https://itunes.apple.com/" + cc + "/rss/topsongs/limit=12/json");
    if (!r.ok) throw new Error("apple chart " + r.status);
    const d = await r.json();
    const items = ((d && d.feed && d.feed.entry) || [])
      .map((e) => ({
        t: (e["im:name"] && e["im:name"].label) || "",
        a: (e["im:artist"] && e["im:artist"].label) || "",
        art: (((e["im:image"] || []).pop() || {}).label || "").replace("170x170bb", "300x300bb"),
        genre: genreOf(e),
      }))
      .filter((x) => x.t && chartOk(x.t, x.a, x.genre));
    cacheSet(key, items);
    return items;
  }

  async function fetchDeezerChart() {
    const key = "favsongs.chart.deezer";
    const hit = cacheGet(key);
    if (hit) return hit;
    const r = await fetch("https://api.deezer.com/chart?limit=12");
    if (!r.ok) throw new Error("deezer chart " + r.status);
    const d = await r.json();
    const items = ((d && d.tracks && d.tracks.data) || [])
      .map((x) => ({
        t: x.title || "",
        a: (x.artist && x.artist.name) || "",
        art: x.cover_medium || x.cover || "",
        genre: "",
      }))
      .filter((x) => x.t && chartOk(x.t, x.a, x.genre));
    cacheSet(key, items);
    return items;
  }

  // Reciprocal-rank fusion across sources: tracks charting in several
  // places (the "common" ones) naturally float to the top.
  function mergeCharts(lists, cap) {
    const map = new Map();
    for (const list of lists) {
      (list || []).forEach((it, rank) => {
        const key = norm(it.t) + "|||" + norm(it.a);
        if (!key.replace(/\|/g, "")) return;
        let e = map.get(key);
        if (!e) {
          e = { item: { t: it.t, a: it.a, art: it.art || "" }, score: 0, seen: 0 };
          map.set(key, e);
        }
        e.score += 1 / (rank + 1);
        e.seen += 1;
        if (!e.item.art && it.art) e.item.art = it.art;
      });
    }
    return [...map.values()]
      .sort((a, b) => b.score - a.score || b.seen - a.seen)
      .slice(0, cap || 12)
      .map((e) => e.item);
  }

  // Combined trending for a country: Apple storefront + Deezer worldwide,
  // fused. Degrades to whichever source answers.
  async function combinedTrending(cc) {
    const [a, b] = await Promise.all([fetchAppleChart(cc).catch(() => []), fetchDeezerChart().catch(() => [])]);
    const merged = mergeCharts([a, b]);
    return merged.length ? merged : a.length ? a : b;
  }

  window.FavCharts = {
    detectCountry, detectCountryFresh, setCountryOverride, clearCountryOverride,
    fetchAppleChart, fetchDeezerChart, mergeCharts,
    combinedTrending, chartOk,
  };
})();
