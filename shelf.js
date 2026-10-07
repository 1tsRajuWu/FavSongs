(() => {
  "use strict";
  const LS_KEY = "favsongs.shelf.v1";
  const SHARE_CAP = 12;
  const $ = (id) => document.getElementById(id);

  const escRe = /["'<>\\s]/;
  function cleanStr(s, max) {
    return String(s || "").trim().slice(0, max || 120);
  }
  function safeHttps(u) {
    const s = String(u || "").trim();
    return /^https:\/\/[^"'<>\s]+$/i.test(s) ? s : "";
  }

  function loadShelf() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((s) => s && s.t) : [];
    } catch { return []; }
  }
  function saveShelf(shelf) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(shelf)); } catch { /* private mode */ }
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
        const shelf = loadShelf().filter((o) => o.id !== s.id);
        saveShelf(shelf);
        render();
      });
      a.appendChild(x);
    }
    return a;
  }

  function render() {
    const shelf = loadShelf();
    const grid = $("shelfGrid");
    grid.innerHTML = "";
    $("shelfTitle").textContent = "Your shelf";
    $("shelfMeta").textContent = shelf.length ? shelf.length + " song" + (shelf.length > 1 ? "s" : "") : "";
    $("shelfEmpty").hidden = shelf.length > 0;
    $("shareRow").hidden = shelf.length === 0;
    for (const s of shelf) grid.appendChild(cardEl(s, true));
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
  const SVC_LOGO = {
    "open.spotify.com": "https://cdn.simpleicons.org/spotify",
    "music.apple.com": "https://cdn.simpleicons.org/applemusic",
    "music.youtube.com": "https://cdn.simpleicons.org/youtubemusic",
    "youtube.com": "https://cdn.simpleicons.org/youtube",
    "soundcloud.com": "https://cdn.simpleicons.org/soundcloud",
    "deezer.com": "https://cdn.simpleicons.org/deezer",
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
    $("saveAllBtn").addEventListener("click", () => {
      const mine = loadShelf();
      const have = new Set(mine.map((o) => (o.t + "|||" + o.a).toLowerCase()));
      let n = 0;
      for (const s of shared) {
        const key = (s.t + "|||" + s.a).toLowerCase();
        if (!have.has(key)) {
          have.add(key);
          mine.push({ ...s, id: "mine-" + Date.now() + "-" + n++ });
        }
      }
      saveShelf(mine);
      history.replaceState(null, "", location.pathname);
      location.reload();
    });
    $("dismissSharedBtn").addEventListener("click", () => {
      history.replaceState(null, "", location.pathname);
      location.reload();
    });
  } else {
    render();
  }

  $("shareBtn").addEventListener("click", async () => {
    const shelf = loadShelf();
    if (!shelf.length) return;
    const link = encodeShare(shelf);
    try {
      await navigator.clipboard.writeText(link);
      $("shareHint").textContent = "Copied — anyone opening it sees this shelf.";
    } catch {
      prompt("Copy your share link:", link);
    }
  });

  $("addBtn").addEventListener("click", () => {
    const t = cleanStr($("fTitle").value);
    if (!t) { $("fTitle").focus(); return; }
    const shelf = loadShelf();
    shelf.push({
      id: "mine-" + Date.now(),
      t, a: cleanStr($("fArtist").value),
      al: "", art: safeHttps($("fArt").value), u: safeHttps($("fLink").value),
    });
    saveShelf(shelf);
    $("fTitle").value = $("fArtist").value = $("fLink").value = $("fArt").value = "";
    render();
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
    