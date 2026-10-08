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

  /* One labelled input, the same shape the home page uses. */
  function fieldFor(id, label, placeholder, max) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const l = document.createElement("label");
    l.setAttribute("for", id);
    l.textContent = label;
    const input = document.createElement("input");
    input.id = id;
    input.type = "text";
    input.maxLength = max;
    input.placeholder = placeholder;
    input.autocomplete = "off";
    wrap.append(l, input);
    return { wrap, input };
  }

  /* What a rename or a note says when it lands. One line, like every other
     action on this page, so the same gesture always answers the same way. */
  function editSaved(before, after) {
    if (!after.title && !after.note) return "Cleared the name and note.";
    if (after.title !== before.title) {
      return after.title ? "Named it “" + after.title + "”." : "Back to the songs for the name.";
    }
    return "Saved the note.";
  }

  /* Each editable card gets its own field ids, so two cards open at once never
     fight over the same label target. */
  let editSeq = 0;

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
    /* The card edits one record in place: `current` is that record, and every
       change below goes through store.js and comes back here. */
    let current = k;
    let listOpen = false;
    const el = document.createElement("article");
    el.className = "panel kept";

    const head = document.createElement("div");
    head.className = "kept-head";
    head.append(coverStack(current.songs));

    const title = document.createElement("div");
    title.className = "kept-title";
    const h = document.createElement("h3");
    const m = document.createElement("p");
    m.className = "mini";
    const note = document.createElement("p");
    note.className = "kept-note";
    title.append(h, m, note);
    head.append(title);

    /* Rename and note: the two things a shelf grows after it is kept. The panel
       is built once and revealed in place, so opening it never re-renders the
       page and whatever sits under the card keeps its scroll. */
    editSeq += 1;
    const panelId = "kept-edit-" + editSeq;
    const panel = document.createElement("div");
    panel.className = "kept-edit";
    panel.id = panelId;
    panel.hidden = true;
    const fields = document.createElement("div");
    fields.className = "fields";
    const nameText = fieldFor(panelId + "-name", "Shelf name", "Name this shelf", 60);
    const noteText = fieldFor(panelId + "-note", "Note", "Why you kept it (optional)", 120);
    const nameInput = nameText.input;
    const noteInput = noteText.input;
    fields.append(nameText.wrap, noteText.wrap);
    const panelActions = document.createElement("div");
    panelActions.className = "actions";
    const saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-sm btn-primary";
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-sm btn-ghost";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    const hint = document.createElement("span");
    hint.className = "fav-hint";
    hint.textContent = "The order is edited in the song list below";
    panelActions.append(saveBtn, cancelBtn, hint);
    panel.append(fields, panelActions);

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
      const added = store.addSongs(current.songs);
      say(
        added
          ? "Added " + added + " song" + (added > 1 ? "s" : "") + " to your shelf."
          : "All " + current.songs.length + " songs are already on your shelf.",
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
      store.dropKept(current.id);
      render();
      say("Removed “" + nameOf(current) + "”.", {
        label: "Undo",
        // Same entry, same name, same note, same timestamp: it comes back as it was.
        run: () => { store.keep({ ...current }); render(); say("Put back."); },
      });
    });
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-sm btn-ghost";
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.setAttribute("aria-expanded", "false");
    editBtn.setAttribute("aria-controls", panel.id);
    editBtn.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      editBtn.setAttribute("aria-expanded", String(open));
      if (!open) return;
      // The fields start from what is stored, never from the last thing typed.
      nameInput.value = current.title;
      noteInput.value = current.note;
      nameInput.focus();
    });
    actions.append(editBtn, add, copy, drop);
    head.append(actions);
    el.append(head, panel);

    const toggle = document.createElement("button");
    toggle.className = "kept-toggle";
    toggle.type = "button";
    const songsBox = document.createElement("div");
    songsBox.className = "shelf-grid kept-songs";
    songsBox.hidden = true;

    /* What the card calls this shelf: the name someone gave it, or the songs. */
    function nameOf() {
      return current.title || shelfTitle(current.songs);
    }

    /* Everything the card prints comes from `current`, so one paint keeps the
       heading, the meta line, the note and the toggle label in step. */
    function paint() {
      const short = shortIdOf(current.url);
      h.textContent = nameOf();
      m.textContent =
        current.songs.length + " song" + (current.songs.length > 1 ? "s" : "") + " · " + keptWhen(current.at) +
        (short ? " · /" + short : "");
      note.textContent = current.note;
      note.hidden = !current.note;
      toggle.textContent =
        (listOpen ? "Hide" : "Show") + " the " + current.songs.length + " song" + (current.songs.length > 1 ? "s" : "");
      toggle.setAttribute("aria-expanded", String(listOpen));
    }

    function moveBtn(glyph, label, disabled, run) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = glyph;
      b.disabled = disabled;
      b.setAttribute("aria-label", label);
      b.addEventListener("click", run);
      return b;
    }

    /* Each row carries its own order controls: the list is where the order
       matters, so the buttons sit one row away from the thing they move. */
    function songRow(s, at, total) {
      const row = document.createElement("div");
      row.className = "kept-song";
      row.append(songCard(s));
      const bar = document.createElement("div");
      bar.className = "kept-move";
      const pos = document.createElement("span");
      pos.className = "kept-pos";
      pos.textContent = String(at + 1).padStart(2, "0");
      bar.append(
        pos,
        moveBtn("↑", "Move “" + s.t + "” up", at === 0, () => move(at, -1)),
        moveBtn("↓", "Move “" + s.t + "” down", at === total - 1, () => move(at, 1)),
      );
      row.append(bar);
      return row;
    }

    /* Reordering repaints the rows only: the name, the note, the panel and the
       page under the card all stay exactly where they were, and the button that
       was pressed keeps focus on the row it moved. */
    function paintSongs(focusAt, focusWhich) {
      songsBox.textContent = "";
      current.songs.forEach((s_, at) => songsBox.append(songRow(s_, at, current.songs.length)));
      if (focusAt == null) return;
      const row = songsBox.children[focusAt];
      if (!row) return;
      const [up, down] = row.querySelectorAll(".kept-move button");
      const wanted = focusWhich === "up" ? up : down;
      const target = wanted && !wanted.disabled ? wanted : (wanted === up ? down : up);
      if (target) target.focus();
    }

    function move(at, delta) {
      const next = store.moveKeptSong(current.id, at, delta);
      if (!next) {
        say("Could not reorder that shelf.");
        return;
      }
      current = next;
      paintSongs(at + delta, delta < 0 ? "up" : "down");
      say("Moved “" + next.songs[at + delta].t + "” " + (delta < 0 ? "up" : "down") + ".");
    }

    toggle.addEventListener("click", () => {
      listOpen = !listOpen;
      songsBox.hidden = !listOpen;
      if (listOpen && !songsBox.childElementCount) paintSongs();
      paint();
    });

    saveBtn.addEventListener("click", () => {
      const before = { title: current.title, note: current.note };
      const next = store.editKept(current.id, { title: nameInput.value, note: noteInput.value });
      if (!next) {
        say("Could not save that — this browser refused the write.");
        return;
      }
      current = next;
      panel.hidden = true;
      editBtn.setAttribute("aria-expanded", "false");
      paint();
      say(editSaved(before, next), {
        label: "Undo",
        run: () => {
          const back = store.editKept(current.id, before);
          if (!back) {
            say("Could not undo that.");
            return;
          }
          current = back;
          paint();
          say("Put the name and note back.");
        },
      });
    });

    cancelBtn.addEventListener("click", () => {
      panel.hidden = true;
      editBtn.setAttribute("aria-expanded", "false");
    });

    el.append(toggle, songsBox);
    paint();
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
