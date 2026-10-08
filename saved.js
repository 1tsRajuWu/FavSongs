/* Kept shelves — the page that makes “Keep this shelf” mean something.
   Reads favsongs.kept.v1 through store.js and lists every shelf kept from a
   shared link, newest first. Each one can be reopened, merged into the shelf,
   copied, or dropped — removals offer an undo instead of a confirm dialog. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const store = window.FavSongsStore;
  const list = $("keptList");
  const meta = $("keptMeta");
  const empty = $("keptEmpty");
  const note = $("keptNote");

  const songPageUrl = (s) => {
    const p = new URLSearchParams();
    p.set("t", s.t);
    if (s.a) p.set("a", s.a);
    if (s.al) p.set("al", s.al);
    if (s.art) p.set("art", s.art);
    if (s.u) p.set("u", s.u);
    return "song.html?" + p.toString();
  };

  const shelfTitle = (songs) =>
    songs.length > 1 ? songs[0].t + " and " + (songs.length - 1) + " more" : songs[0].t;

  /* The short id in the link someone sent, when there is one: it is the string
     the shelf is known by, so two entries holding the same songs stay apart. */
  function shortIdOf(url) {
    try {
      const seg = new URL(url).pathname.replace(/\/+$/, "").split("/").filter(Boolean);
      const name = seg[0] || "";
      const pages = ["s", "index", "song", "saved", "shelf", "legal"];
      return seg.length === 1 && name && !name.includes(".") && !pages.includes(name) ? name : "";
    } catch { return ""; }
  }

  function keptWhen(at) {
    if (!at) return "kept earlier";
    const days = Math.floor((Date.now() - at) / 86400000);
    if (days <= 0) return "kept today";
    if (days === 1) return "kept yesterday";
    if (days < 30) return "kept " + days + " days ago";
    return "kept " + new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function say(message, action) {
    note.hidden = false;
    note.textContent = message;
    if (!action) return;
    const el = document.createElement(action.href ? "a" : "button");
    if (action.href) el.href = action.href;
    else {
      el.type = "button";
      el.addEventListener("click", action.run);
    }
    el.className = "link-btn";
    el.textContent = action.label;
    note.append(" ", el);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  function coverStack(songs) {
    const wrap = document.createElement("div");
    wrap.className = "kept-art";
    const arts = songs.filter((s) => s.art).slice(0, 3);
    if (!arts.length) {
      const img = document.createElement("img");
      img.src = "icon.svg";
      img.alt = "";
      wrap.append(img);
      return wrap;
    }
    /* Newest cover on top; a cover that fails to load just drops out. */
    arts.forEach((s, i) => {
      const img = document.createElement("img");
      img.src = s.art;
      img.alt = "";
      img.loading = "lazy";
      img.style.zIndex = String(9 - i);
      img.addEventListener("error", () => img.remove(), { once: true });
      wrap.append(img);
    });
    return wrap;
  }

  function songCard(s) {
    const a = document.createElement("a");
    a.className = "song-card";
    a.href = songPageUrl(s);
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.width = 56;
    img.height = 56;
    img.src = s.art || "icon.svg";
    img.addEventListener("error", () => { img.src = "icon.svg"; }, { once: true });
    const t = document.createElement("div");
    t.className = "t";
    const b = document.createElement("b");
    b.textContent = s.t;
    const sp = document.createElement("span");
    sp.textContent = s.a || "Unknown artist";
    t.append(b, sp);
    a.append(img, t);
    return a;
  }

  function entry(k) {
    const el = document.createElement("article");
    el.className = "panel kept";

    const head = document.createElement("div");
    head.className = "kept-head";
    head.append(coverStack(k.songs));

    const title = document.createElement("div");
    title.className = "kept-title";
    const h = document.createElement("h3");
    h.textContent = shelfTitle(k.songs);
    const m = document.createElement("p");
    m.className = "mini";
    const short = shortIdOf(k.url);
    m.textContent =
      k.songs.length + " song" + (k.songs.length > 1 ? "s" : "") + " · " + keptWhen(k.at) +
      (short ? " · /" + short : "");
    title.append(h, m);
    head.append(title);

    const actions = document.createElement("div");
    actions.className = "kept-actions";
    if (k.url) {
      const open = document.createElement("a");
      open.className = "btn btn-sm btn-primary";
      open.href = k.url;
      open.textContent = "Open shelf";
      actions.append(open);
    }
    const add = document.createElement("button");
    add.className = "btn btn-sm";
    add.type = "button";
    add.textContent = "Add to my shelf";
    add.addEventListener("click", () => {
      const added = store.addSongs(k.songs);
      say(
        added
          ? "Added " + added + " song" + (added > 1 ? "s" : "") + " to your shelf."
          : "All " + k.songs.length + " songs are already on your shelf.",
        { label: "see your shelf", href: "index.html#shelf" },
      );
    });
    const copy = document.createElement("button");
    copy.className = "btn btn-sm btn-ghost";
    copy.type = "button";
    copy.textContent = "Copy link";
    copy.addEventListener("click", async () => {
      const ok = await copyText(k.url || location.href);
      say(ok ? "Link copied." : "Could not copy — open the shelf and copy from the address bar.");
    });
    const drop = document.createElement("button");
    drop.className = "btn btn-sm btn-ghost";
    drop.type = "button";
    drop.textContent = "Remove";
    drop.addEventListener("click", () => {
      store.dropKept(k.id);
      render();
      say("Removed “" + shelfTitle(k.songs) + "”.", {
        label: "Undo",
        // Same entry, same timestamp: it comes back where it was.
        run: () => { store.keep({ ...k }); render(); say("Put back."); },
      });
    });
    actions.append(add, copy, drop);
    head.append(actions);
    el.append(head);

    const toggle = document.createElement("button");
    toggle.className = "kept-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Show the " + k.songs.length + " song" + (k.songs.length > 1 ? "s" : "");
    const songs = document.createElement("div");
    songs.className = "shelf-grid kept-songs";
    songs.hidden = true;
    toggle.addEventListener("click", () => {
      songs.hidden = !songs.hidden;
      toggle.setAttribute("aria-expanded", String(!songs.hidden));
      toggle.textContent =
        (songs.hidden ? "Show" : "Hide") + " the " + k.songs.length + " song" + (k.songs.length > 1 ? "s" : "");
      if (!songs.childElementCount) k.songs.forEach((s) => songs.append(songCard(s)));
    });
    el.append(toggle, songs);
    return el;
  }

  /* ---------------------------------------------------------------- library
     Your shelf and the shelves you kept are one file. Export writes it out;
     import reads one back, merging rather than replacing, and treats every
     field in the file as untrusted input (store.js does the normalising). */
  const MAX_FILE = 2 * 1024 * 1024;

  function wireLibrary() {
    const exportBtn = $("exportBtn");
    const importBtn = $("importBtn");
    const importFile = $("importFile");
    if (!exportBtn || !importBtn || !importFile || !store) return;
    const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

    exportBtn.addEventListener("click", () => {
      const lib = store.exportLibrary();
      const songs = lib.shelf.length;
      const shelves = lib.kept.length;
      if (!songs && !shelves) {
        say("Nothing to export yet — build a shelf, or keep one someone sent you.");
        return;
      }
      const blob = new Blob([JSON.stringify(lib, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "favsongs-library.json";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say(
        "Exported " + plural(songs, "song", "songs") + " and " +
          plural(shelves, "kept shelf", "kept shelves") + " to favsongs-library.json.",
        { label: "see your shelf", href: "index.html#shelf" },
      );
    });

    importBtn.addEventListener("click", () => importFile.click());

    importFile.addEventListener("change", async () => {
      const file = importFile.files && importFile.files[0];
      importFile.value = ""; // choosing the same file twice still fires
      if (!file) return;
      if (file.size > MAX_FILE) {
        say("That file is far too big to be a FavSongs library.");
        return;
      }
      let landed = null;
      try {
        landed = store.importLibrary(JSON.parse(await file.text()));
      } catch {
        landed = null;
      }
      if (!landed) {
        say("That file is not a FavSongs library — export one from this page first.");
        return;
      }
      render();
      const empty = !landed.songs && !landed.shelves;
      say(
        "Imported " + plural(landed.songs, "new song", "new songs") + " and " +
          plural(landed.shelves, "kept shelf", "kept shelves") + "." +
          (empty ? " Everything in it was already here." : ""),
        landed.songs ? { label: "see your shelf", href: "index.html#shelf" } : null,
      );
    });
  }

  function render() {
    const kept = store ? store.loadKept() : [];
    list.textContent = "";
    empty.hidden = kept.length > 0;
    const songs = kept.reduce((n, k) => n + k.songs.length, 0);
    meta.textContent = kept.length
      ? kept.length + (kept.length === 1 ? " shelf · " : " shelves · ") + songs + " song" +
        (songs === 1 ? "" : "s") + " · newest first"
      : "Nothing kept yet.";
    kept.forEach((k) => list.append(entry(k)));
  }

  render();
  wireLibrary();
})();
