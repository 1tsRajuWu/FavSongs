/* FavSongs local storage — one owner for the two keys the site keeps:
   your shelf (favsongs.shelf.v1) and the shelves you kept from someone's link
   (favsongs.kept.v1). The home shelf, the shared-link viewer and the kept page
   all go through here, so the formats can never disagree about a song.
   Everything is best-effort: private mode or cleared storage simply reads as
   empty, and nothing throws at the caller. */
(() => {
  "use strict";
  const SHELF_KEY = "favsongs.shelf.v1";
  const KEPT_KEY = "favsongs.kept.v1";
  const SHARE_KEY = "favsongs.share.v1";
  const KEPT_CAP = 50;
  const SONG_CAP = 24;

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; } // private mode / quota — the caller keeps its own copy
  }

  const text = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max || 120);
  const https = (v) => (/^https:\/\/[^"'<>\s]+$/i.test(String(v || "").trim()) ? String(v).trim() : "");
  const anyUrl = (v) => (/^https?:\/\/[^"'<>\s]+$/i.test(String(v || "").trim()) ? String(v).trim() : "");
  const songKey = (s) => (text(s && s.t) + "|||" + text(s && s.a)).toLowerCase();

  /* One song, in the only shape the pages ever see. */
  function song(s) {
    return {
      t: text(s && s.t),
      a: text(s && s.a),
      al: text(s && s.al),
      art: https(s && s.art),
      u: https(s && s.u),
    };
  }

  function loadShelf() {
    return read(SHELF_KEY)
      .filter((s) => s && text(s.t))
      .map((s) => ({ ...song(s), id: text(s.id, 80) }));
  }

  function saveShelf(shelf) {
    write(SHELF_KEY, (shelf || []).map((s) => ({ ...song(s), id: text(s.id, 80) })));
  }

  /* Merge songs into the shelf, skipping ones already there. Returns how many
     were new, which is what every caller wants to tell the user. */
  function addSongs(songs) {
    const mine = loadShelf();
    const have = new Set(mine.map(songKey));
    let added = 0;
    // Two imports in the same millisecond still get different ids: the id is
    // how the shelf removes the exact card the user tapped.
    const stamp = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    for (const raw of songs || []) {
      const s = song(raw);
      if (!s.t) continue;
      const key = songKey(s);
      if (have.has(key)) continue;
      have.add(key);
      mine.push({ ...s, id: "mine-" + stamp + "-" + added });
      added++;
    }
    if (added) write(SHELF_KEY, mine);
    return added;
  }

  function loadKept() {
    return read(KEPT_KEY)
      .filter((k) => k && Array.isArray(k.songs) && k.songs.length)
      .map((k) => ({
        id: text(k.id, 24),
        url: anyUrl(k.url),
        at: Number(k.at) || 0,
        // A kept shelf outlives the moment it was kept: the name and the note
        // are the two fields a page prints verbatim, so they are normalised
        // here like everything else.
        title: text(k.title, 60),
        note: text(k.note, 120),
        songs: k.songs.map(song).filter((s) => s.t).slice(0, SONG_CAP),
      }))
      .sort((a, b) => b.at - a.at);
  }

  /* Keep a whole shelf someone shared: newest first, one entry per link. An
     entry that brings its own timestamp keeps it, so an undo lands back in
     place instead of jumping to the top. A shelf already kept under this id
     hands over the name and note it has, so keeping a shelf again never wipes
     what someone wrote about it. */
  function keep(entry) {
    const songs = (entry.songs || []).map(song).filter((s) => s.t).slice(0, SONG_CAP);
    if (!songs.length) return null;
    const id = text(entry.id, 24) || "long";
    const all = loadKept();
    const was = all.find((k) => k.id === id);
    const kept = all.filter((k) => k.id !== id);
    kept.unshift({
      id,
      url: anyUrl(entry.url),
      at: Number(entry.at) || Date.now(),
      title: text(entry.title, 60) || (was ? was.title : ""),
      note: text(entry.note, 120) || (was ? was.note : ""),
      songs,
    });
    const capped = kept.slice(0, KEPT_CAP);
    write(KEPT_KEY, capped);
    return capped;
  }

  /* Rename a kept shelf, write a note on it, or clear either. Only the two
     fields the page prints are touched, and both go back through the same
     normalisation, so an edit can never widen the shape a page has to handle. */
  function editKept(id, patch) {
    if (!patch) return null;
    const wanted = text(id, 24);
    const kept = loadKept();
    const entry = kept.find((k) => k.id === wanted);
    if (!entry) return null;
    if ("title" in patch) entry.title = text(patch.title, 60);
    if ("note" in patch) entry.note = text(patch.note, 120);
    return write(KEPT_KEY, kept) ? entry : null;
  }

  /* Move one song inside a kept shelf. Both positions come from the store's own
     list, so a reorder can never add, drop or duplicate a song — the only thing
     that changes is the order the rows come back in. */
  function moveKeptSong(id, index, delta) {
    const at = Number(index);
    const step = Number(delta) < 0 ? -1 : 1;
    const kept = loadKept();
    const entry = kept.find((k) => k.id === text(id, 24));
    if (!entry || !Number.isInteger(at)) return null;
    const to = at + step;
    if (at < 0 || to < 0 || to >= entry.songs.length) return null;
    const [moved] = entry.songs.splice(at, 1);
    entry.songs.splice(to, 0, moved);
    return write(KEPT_KEY, kept) ? entry : null;
  }

  function dropKept(id) {
    const kept = loadKept().filter((k) => k.id !== id);
    write(KEPT_KEY, kept);
    return kept;
  }

  function isKept(id) {
    return loadKept().some((k) => k.id === id);
  }

  /* The short links this browser has made, newest first, keyed by the shelf
     they carry (its songs, in order). A shelf that comes back to an earlier
     state gets its earlier link back, so the link in someone's bio survives
     edits instead of being replaced by a new row on every reshare. Only short
     links are worth remembering — a long #p= fallback belongs in no bio. */
  const LINK_CAP = 4;
  function shortLink(value) {
    const link = text(value, 300);
    return /^https?:\/\/[^"'<>\s]+$/.test(link) && !link.includes("#p=") ? link : "";
  }

  function loadLinks() {
    return read(SHARE_KEY)
      .map((e) => ({ key: text(e && e.key, 400), link: shortLink(e && e.link) }))
      .filter((e) => e.key && e.link);
  }

  /* The remembered link for this exact shelf, or null. */
  function loadLink(key) {
    const wanted = text(key, 400);
    if (!wanted) return null;
    return loadLinks().find((e) => e.key === wanted) || null;
  }

  function saveLink(key, link) {
    const k = text(key, 400);
    const l = shortLink(link);
    if (!k || !l) return;
    write(SHARE_KEY, [{ key: k, link: l }, ...loadLinks().filter((e) => e.key !== k)].slice(0, LINK_CAP));
  }

  /* Everything this browser holds, in one file the reader owns. A shelf that
     only exists in localStorage disappears with a cleared cache, a new laptop
     or a private window, so the library has to be portable to be trusted. */
  const FORMAT = "favsongs.library.v1";
  const FILE_SONG_CAP = 500;

  function exportLibrary() {
    return {
      format: FORMAT,
      exported: new Date().toISOString(),
      shelf: loadShelf(),
      kept: loadKept(),
      links: loadLinks(),
    };
  }

  /* Read a library file back in. Nothing in it is trusted: every field goes
     through the same normalisation the live state uses, lists are capped, and
     an entry that survives is merged rather than replacing what is here.
     Returns what actually landed, or null when the file is not ours. */
  function importLibrary(data) {
    if (!data || typeof data !== "object" || data.format !== FORMAT) return null;
    const songs = (Array.isArray(data.shelf) ? data.shelf : []).slice(0, FILE_SONG_CAP);
    const added = addSongs(songs);
    const had = new Set(loadKept().map((k) => k.id));
    let shelves = 0;
    for (const entry of (Array.isArray(data.kept) ? data.kept : []).slice(0, KEPT_CAP)) {
      if (!entry || typeof entry !== "object") continue;
      const id = text(entry.id, 24) || "long";
      if (had.has(id)) continue;
      if (!keep({ id, url: entry.url, at: entry.at, title: entry.title, note: entry.note, songs: entry.songs })) continue;
      had.add(id);
      shelves++;
    }
    let links = 0;
    for (const entry of (Array.isArray(data.links) ? data.links : []).slice(0, LINK_CAP)) {
      if (!entry || typeof entry !== "object") continue;
      if (loadLink(entry.key)) continue;
      const link = shortLink(entry.link);
      // A file someone handed you may not redirect this browser's own short
      // links somewhere else: they have to point at this site.
      if (!link.startsWith(location.origin + "/")) continue;
      saveLink(entry.key, link);
      links++;
    }
    return { songs: added, shelves, links };
  }

  window.FavSongsStore = {
    loadShelf, saveShelf, addSongs,
    loadKept, keep, editKept, moveKeptSong, dropKept, isKept,
    loadLink, saveLink,
    exportLibrary, importLibrary,
    songKey, text, https,
  };
})();
