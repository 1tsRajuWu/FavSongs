(() => {
  "use strict";
  const SHARE_CAP = 12;
  const $ = (id) => document.getElementById(id);
  // store.js owns both localStorage keys and is loaded just before this file;
  // if it ever went missing the shelf shows its empty state rather than crashing.
  const store = window.FavSongsStore || null;

  const escRe = /["'<>\\s]/;
  function cleanStr(s, max) {
    return String(s || "").trim().slice(0, max || 120);
  }
  function safeHttps(u) {
    const s = String(u || "").trim();
    return /^https:\/\/[^"'<>\s]+$/i.test(s) ? s : "";
  }

  const loadShelf = () => (store ? store.loadShelf() : []);
  const saveShelf = (shelf) => { if (store) store.saveShelf(shelf); };

  // Every shelf action says what it did. One line, optionally with a link or an
  // undo button — the same shape the Kept page uses, so feedback reads alike.
  function note(message, action) {
    const el = $("shareHint");
    if (!el) return;
    el.textContent = message;
    if (!action) return;
    const act = document.createElement(action.href ? "a" : "button");
    if (action.href) act.href = action.href;
    else {
      act.type = "button";
      act.addEventListener("click", action.run);
    }
    act.className = "link-btn";
    act.textContent = action.label;
    el.append(" ", act);
  }

  function songPageUrl(s) {
    const p = new URLSearchParams();
    p.set("t", s.t);
    if (s.a) p.set("a", s.a);
    if (s.al) p.set("al", s.al);
    if (s.art) p.set("art", s.art);
    if (s.u) p.set("u", s.u);
    return "song.html?" + p.toString();
  }

  function cardEl(s, mine) {
    const a = document.createElement("a");
    a.className = "song-card";
    a.href = songPageUrl(s);
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.width = 56;
    img.height = 56;
    if (s.art) {
      img.src = s.art;
      img.onerror = () => { img.src = "icon.svg"; img.onerror = null; };
    } else {
      img.src = "icon.svg";
    }
    const t = document.createElement("div");
    t.className = "t";
    const b = document.createElement("b");
    b.textContent = s.t;
    const sp = document.createElement("span");
    sp.textContent = s.a || "Unknown artist";
    t.appendChild(b);
    t.appendChild(sp);
    a.appendChild(img);
    a.appendChild(t);
    if (mine) {
      const x = document.createElement("button");
      x.className = "x";
      x.type = "button";
      x.textContent = "×";
      x.setAttribute("aria-label", "Remove " + s.t);
      x.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const shelf = loadShelf();
        const at = shelf.findIndex((o) => o.id === s.id);
        if (at < 0) return;
        shelf.splice(at, 1);
        saveShelf(shelf);
        render();
        // Removing a song is one tap away from a mistake — put it back.
        note("Removed “" + s.t + "”.", {
          label: "Undo",
          run: () => {
            const back = loadShelf();
            back.splice(Math.min(at, back.length), 0, s);
            saveShelf(back);
            render();
            note("Put “" + s.t + "” back.");
          },
        });
      });
      a.appendChild(x);
    }
    return a;
  }

  function render(highlight) {
    const shelf = loadShelf();
    const grid = $("shelfGrid");
    grid.innerHTML = "";
    $("shelfTitle").textContent = "Your shelf";
    $("shelfMeta").textContent = shelf.length ? shelf.length + " song" + (shelf.length > 1 ? "s" : "") : "";
    $("shelfEmpty").hidden = shelf.length > 0;
    $("shareRow").hidden = shelf.length === 0;
    for (const s of shelf) {
      const card = cardEl(s, true);
      if (highlight && s.id === highlight) card.classList.add("pop");
      grid.appendChild(card);
    }
  }

  /* Stable, short identity for a shelf that has no id of its own (FNV-1a). */
  function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  // The identifier in your link is read aloud, retyped and pasted into a bio,
  // so it is lowercase only and carries no lookalike glyphs (no 0/O, no 1/l/I).
  // 8 characters of 31 is ~40 bits: collisions are not a real risk.
  const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
  function shortId() {
    const out = [];
    const buf = new Uint8Array(16);
    while (out.length < 8) {
      crypto.getRandomValues(buf);
      for (const b of buf) {
        if (b >= 248) continue; // 248 = 31 × 8: every character stays equally likely
        out.push(ID_ALPHABET[b % ID_ALPHABET.length]);
        if (out.length === 8) break;
      }
    }
    return out.join("");
  }

  /* The backend, when this deploy has one. Never throws. */
  function backend() {
    const base = window.FAVSONGS_SUPABASE_URL || "";
    const key = window.FAVSONGS_SUPABASE_ANON_KEY || "";
    if (!base.startsWith("https://") || base.includes("YOUR_NEW") || key.length < 20) return null;
    return { base, key };
  }

  const slimShelf = (shelf) =>
    shelf.slice(0, 24).map((s) => ({ t: s.t, a: s.a || "", al: s.al || "", art: s.art || "", u: s.u || "" }));

  // The secret behind a shelf this browser owns. The backend keeps only its
  // SHA-256, so a leak of the table does not hand anyone the ability to rewrite
  // a shelf. See supabase/shared-links.sql.
  function shareKey() {
    const buf = new Uint8Array(24);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* Short backend link (/<id>) with the self-contained #p= link as the offline
     fallback. Returns the id and the key that owns it, so the same link can be
     updated later instead of being replaced. Never throws. */
  async function createShortLink(shelf) {
    const c = backend();
    if (!c) return null;
    const id = shortId();
    const key = shareKey();
    try {
      const r = await fetch(c.base + "/rest/v1/shared_links", {
        method: "POST",
        headers: {
          apikey: c.key,
          Authorization: "Bearer " + c.key,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
          "x-share-key": key,
        },
        body: JSON.stringify({ id, songs: slimShelf(shelf) }),
      });
      if (!r.ok) return null;
      return { id, key, link: location.origin + "/" + id };
    } catch {
      return null;
    }
  }

  /* Update the row this browser owns, so the link already sitting in someone's
     bio keeps pointing at the current shelf. Until the backend carries the
     matching policy this simply changes nothing (zero rows come back) and the
     caller mints a new link, which is how the site behaved before. */
  async function updateShortLink(own, shelf) {
    const c = backend();
    if (!c || !own || !own.id || !own.key) return false;
    try {
      const r = await fetch(c.base + "/rest/v1/shared_links?id=eq." + encodeURIComponent(own.id), {
        method: "PATCH",
        headers: {
          apikey: c.key,
          Authorization: "Bearer " + c.key,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          "x-share-key": own.key,
        },
        body: JSON.stringify({ songs: slimShelf(shelf) }),
      });
      if (!r.ok) return false;
      const rows = await r.json();
      return Array.isArray(rows) && rows.length === 1;
    } catch {
      return false;
    }
  }


  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* denied / headless */ }
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }

  function encodeShare(shelf) {
    const slim = shelf.slice(0, SHARE_CAP).map((s) => ({
      t: s.t, a: s.a || "", al: s.al || "", art: s.art || "", u: s.u || "",
    }));
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(slim))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return location.origin + location.pathname + "#p=" + b64;
  }

  function decodeShare(hash) {
    try {
      const b64 = hash.replace(/^#p=/, "").replace(/-/g, "+").replace(/_/g, "/");
      const arr = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((s) => s && typeof s.t === "string" && s.t.trim())
        .slice(0, 24)
        .map((s, i) => ({
          id: "shared-" + Date.now() + "-" + i,
          t: cleanStr(s.t), a: cleanStr(s.a), al: cleanStr(s.al),
          art: safeHttps(s.art), u: safeHttps(s.u),
        }));
    } catch { return []; }
  }

  // Shared-shelf view (#p= link): pinned favourite on top, playlist below.
  const shared = decodeShare(location.hash || "");

  // A second #p= link opened in this tab, or a plain fragment link clicked from
  // a long-link view, changes only the hash — this script never runs again, so
  // the page would keep showing the shelf you just navigated away from.
  const startHash = location.hash.startsWith("#p=") ? location.hash : "";
  let reloading = false;
  window.addEventListener("hashchange", () => {
    if (reloading) return;
    const next = location.hash.startsWith("#p=") ? location.hash : "";
    if (next === startHash) return;
    reloading = true;
    location.reload();
  });
  // Self-hosted, single-colour marks — the same set the song page uses.
  const SVC_LOGO = {
    "open.spotify.com": "logos/spotify.svg",
    "music.apple.com": "logos/applemusic.svg",
    "music.youtube.com": "logos/youtubemusic.svg",
    "youtube.com": "logos/youtube.svg",
    "soundcloud.com": "logos/soundcloud.svg",
    "deezer.com": "logos/deezer.svg",
  };
  function svcLogo(u) {
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
      for (const h of Object.keys(SVC_LOGO)) {
        if (host === h || host.endsWith("." + h)) return SVC_LOGO[h];
      }
      return "";
    } catch {
      return "";
    }
  }
  if (shared.length) {
    document.body.classList.add("viewer");
    document.getElementById("sharedBar").hidden = false;
    document.getElementById("sharedNote").textContent =
      shared.length + " song" + (shared.length > 1 ? "s" : "") + " shared with you — save them or just press play.";
    const grid = $("shelfGrid");
    grid.innerHTML = "";
    grid.hidden = true;
    $("shelfTitle").textContent = "Shared shelf";
    $("shelfMeta").textContent = shared.length + " songs";
    $("shelfEmpty").hidden = true;
    $("shareRow").hidden = true;
    $("addBox").hidden = true;
    document.getElementById("playlistWrap").hidden = false;
    window.SharedList.renderPlaylist(
      {
        featuredCard: document.getElementById("featuredCard"),
        featuredArt: document.getElementById("featuredArt"),
        featuredTitle: document.getElementById("featuredTitle"),
        featuredSub: document.getElementById("featuredSub"),
        rowsEl: document.getElementById("playlistRows"),
      },
      shared,
      { playable: true },
    );
    const [first] = shared;
    document.getElementById("playSharedBtn").addEventListener("click", () => {
      location.href = window.SharedList.songPageUrl(first);
    });
    // Say how many landed, then offer the shelf instead of yanking the reader
    // off the shelf they were just sent.
    $("saveAllBtn").addEventListener("click", () => {
      const added = store ? store.addSongs(shared) : 0;
      const status = $("sharedStatus");
      if (!status) return;
      status.hidden = false;
      status.textContent = added
        ? "Added " + added + " song" + (added > 1 ? "s" : "") + " to your shelf — "
        : "All " + shared.length + " song" + (shared.length > 1 ? "s are" : " is") + " already on your shelf — ";
      const a = document.createElement("a");
      a.className = "link-btn";
      a.href = "index.html#shelf";
      a.textContent = "see your shelf";
      a.addEventListener("click", () => {
        history.replaceState(null, "", location.pathname);
      });
      status.append(a);
    });
    // Keep the whole shelf as one entry, so it can be reopened from the Kept
    // page later without digging the link back out of a chat.
    $("keepBtn")?.addEventListener("click", () => {
      // The long link carries no id, so the shelf itself is the identity: two
      // different long links are two entries, the same one is one entry.
      const sig = shared.map((s) => s.t + "|" + s.a).join("~");
      const lid = "long-" + hash32(sig);
      const already = store && store.isKept(lid);
      const kept = store && store.keep({ id: lid, url: location.href, songs: shared });
      const status = $("sharedStatus");
      if (!status) return;
      status.hidden = false;
      status.textContent = kept
        ? (already ? "Already kept — " : "Kept " + shared.length + " song" + (shared.length > 1 ? "s" : "") + " — ")
        : "Could not keep this shelf — ";
      const a = document.createElement("a");
      a.className = "link-btn";
      a.href = "saved.html";
      a.textContent = already ? "open it under Kept" : "see it under Kept";
      status.appendChild(a);
    });
    $("dismissSharedBtn")?.addEventListener("click", () => {
      history.replaceState(null, "", location.pathname);
      location.reload();
    });
  } else {
    render();
  }

  // A second click, a double tap or an impatient repeat must not mint a second
  // link: one shelf, one link. `sharing` stops the overlap, `posted` reuses the
  // link this shelf already has.
  let sharing = false;
  const shelfKey = (shelf) => shelf.map((s) => s.t + "|" + s.a).join("~");

  $("shareBtn").addEventListener("click", async () => {
    if (sharing) return;
    const shelf = loadShelf();
    // An enabled button that does nothing reads as a broken page. There is
    // nothing to hand over yet, so say that and put the cursor where the fix is.
    if (!shelf.length) {
      $("shareHint").textContent = "Nothing to share yet — add a song above and share it as one link.";
      $("fTitle").focus();
      return;
    }
    const hint = $("shareHint");
    const box = document.getElementById("shareBox");
    const input = document.getElementById("shareLink");
    const key = shelfKey(shelf);
    const remembered = store ? store.loadLink(key) : null;
    const btn = $("shareBtn");
    sharing = true;
    btn.disabled = true;
    hint.textContent = "Making a short link…";
    // One shelf, one link: the link this browser already made is looked up
    // first, then the shelf it owns is updated in place, and only a shelf the
    // backend will not let us update mints another one — with the long
    // self-contained link as the offline fallback. Never prompt() — dialogs
    // get suppressed.
    let link = remembered ? remembered.link : "";
    let updated = false;
    // True when this browser owned a link and the backend refused to take the
    // new shelf: the caller mints a fresh id, and the older link keeps pointing
    // at the older songs. The copy says so instead of calling both "your link".
    let forked = false;
    if (!link) {
      const own = store ? store.loadShare() : null;
      if (own) {
        hint.textContent = "Updating your link…";
        if (await updateShortLink(own, shelf)) {
          link = own.link || location.origin + "/" + own.id;
          updated = true;
        } else {
          forked = true;
        }
      }
      if (!link) {
        const made = await createShortLink(shelf);
        if (made) {
          link = made.link;
          if (store) store.saveShare(made);
        }
      }
    }
    if (!link) link = encodeShare(shelf);
    if (store) store.saveLink(key, link); // only short links are worth keeping
    sharing = false;
    btn.disabled = false;
    const short = !link.includes("#p=");
    input.value = link;
    box.hidden = false;
    input.focus();
    input.select();
    const copied = await copyText(link);
    hint.textContent = copied
      ? short
        ? updated
          ? "Copied — the same link, now carrying this shelf."
          : forked
            ? "Copied — a new link. The one this browser made before still shows the older shelf."
            : "Copied — short link, fits bios and chats."
        : "Copied — long link (cloud unreachable, still works)."
      : "Copy the link below manually.";
  });

  /* The link this browser already made, put back on screen when the page loads.
     Without it a reader who shared yesterday has to press Share again — and a
     reshare that the backend refuses mints yet another link, which is exactly
     how a bio ends up pointing at a shelf nobody updated. */
  function showOwnedLink() {
    const box = document.getElementById("shareBox");
    const input = document.getElementById("shareLink");
    if (!box || !input || input.value) return;
    const shelf = loadShelf();
    const own = store ? store.loadShare() : null;
    if (!own || !own.link || !shelf.length) return;
    input.value = own.link;
    box.hidden = false;
    const remembered = store.loadLink(shelfKey(shelf));
    $("shareHint").textContent =
      remembered && remembered.link === own.link
        ? "The link this browser made — press Share to copy it again."
        : "The link this browser made; the shelf has changed since. Press Share to carry the new songs.";
  }
  showOwnedLink();

  $("shareCopyBtn").addEventListener("click", async () => {
    const input = document.getElementById("shareLink");
    input.focus();
    input.select();
    const copied = await copyText(input.value);
    $("shareHint").textContent = copied
      ? "Copied."
      : "Copy the link above manually.";
  });

  $("addBtn").addEventListener("click", () => {
    const song = {
      t: cleanStr($("fTitle").value),
      a: cleanStr($("fArtist").value),
      al: "",
      art: safeHttps($("fArt").value),
      u: safeHttps($("fLink").value),
    };
    if (!song.t) {
      $("fTitle").focus();
      note("A title is all a song needs.");
      return;
    }
    // Adding by hand goes through the same door as an imported shelf, so the
    // same song twice is one card, not two.
    const added = store ? store.addSongs([song]) : 0;
    if (!added) {
      note("“" + song.t + "” is already on your shelf.");
      return;
    }
    $("fTitle").value = $("fArtist").value = $("fLink").value = $("fArt").value = "";
    // addSongs appends, so the last song is the one that just landed. It gets
    // the one-time pop: the shelf says hello to it without a toast.
    const mine = loadShelf();
    render(mine.length ? mine[mine.length - 1].id : "");
    note("Added “" + song.t + "”.");
  });

  // Import: Spotify + YouTube oEmbed auto-fill, Apple = manual.
  $("importBtn").addEventListener("click", async () => {
    const raw = $("importLink").value.trim();
    const hint = $("importHint");
    if (!/^https:\/\//i.test(raw)) { hint.textContent = "Paste an https:// track link first."; return; }
    hint.textContent = "Resolving…";
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      let ep = null;
      if (host === "open.spotify.com" || host === "spotify.com") {
        ep = "https://open.spotify.com/oembed?url=" + encodeURIComponent(raw);
      } else if (host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com") {
        ep = "https://www.youtube.com/oembed?url=" + encodeURIComponent(raw) + "&format=json";
      }
      if (!ep) {
        hint.textContent = "That host needs a manual touch — fill title/artist below and Add.";
        return;
      }
      const r = await fetch(ep);
      if (!r.ok) throw new Error("oembed " + r.status);
      const d = await r.json();
      if (d.title) $("fTitle").value = String(d.title).slice(0, 120);
      if (d.author_name && !$("fArtist").value) $("fArtist").value = String(d.author_name).slice(0, 120);
      if (d.thumbnail_url) {
        try {
          const th = new URL(d.thumbnail_url);
          if (th.protocol === "https:") $("fArt").value = d.thumbnail_url;
        } catch { /* ignore */ }
      }
      $("fLink").value = raw.slice(0, 300);
      hint.textContent = "Imported — check the fields, then Add to shelf.";
    } catch {
      hint.textContent = "Could not resolve that link — fill the fields manually.";
    }
  });

  // Example shelf (labeled demo data, one click to preview sharing).
  const triggerExample = (e) => {
    if (e) e.preventDefault();
    const demo = [
      { t: "Ghost", a: "Justin Bieber", al: "", art: "", u: "https://open.spotify.com/track/6I3mqTwhRpn34SLVafSH7G" },
      { t: "Blinding Lights", a: "The Weeknd", al: "After Hours", art: "", u: "" },
    ];
    location.hash = "#p=" + btoa(unescape(encodeURIComponent(JSON.stringify(demo))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    location.reload();
  };
  const exBtn = $("exampleShelf");
  if (exBtn) exBtn.addEventListener("click", triggerExample);
  const emptyBtn = $("emptyExampleBtn");
  if (emptyBtn) emptyBtn.addEventListener("click", triggerExample);
  // Bridge for the optional cloud module (auth/sync/discover).
  window.FavShelf = { loadShelf, saveShelf, render, songPageUrl, cleanStr, safeHttps, cardEl };
})();
    