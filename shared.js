/* Shared playlist renderer — used by s.html (?id=) and shelf.html (#p=).
 * Featured pinned favourite on top, numbered rows below, iTunes art
 * resolution, album-tinted featured background. No dependencies. */
(() => {
  "use strict";

  function songPageUrl(s) {
    const p = new URLSearchParams();
    p.set("t", s.t);
    if (s.a) p.set("a", s.a);
    if (s.al) p.set("al", s.al);
    if (s.art) p.set("art", s.art);
    if (s.u) p.set("u", s.u);
    return "song.html?" + p.toString();
  }

  const artCache = new Map();
  function resolveArt(t, a) {
    const key = ((t || "") + "|||" + (a || "")).toLowerCase();
    if (artCache.has(key)) return artCache.get(key);
    const p = (async () => {
      try {
        const r = await fetch(
          "https://itunes.apple.com/search?term=" +
            encodeURIComponent([t, a].filter(Boolean).join(" ")) +
            "&media=music&entity=song&limit=1",
        );
        if (!r.ok) return "";
        const d = await r.json();
        const hit = d && d.results && d.results[0];
        const art = hit && hit.artworkUrl100 ? String(hit.artworkUrl100) : "";
        return art ? art.replace("100x100bb", "600x600bb") : "";
      } catch {
        return "";
      }
    })();
    artCache.set(key, p);
    return p;
  }

  // The card borrows only *light* from its artwork, never a second colour:
  // the palette stays black, ink and red, so a green cover can't turn a card
  // green. Sets --ft (a soft top sheen), used by CSS.
  function tintFromArt(img, card) {
    try {
      const SIZE = 32;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
      let lum = 0, n = 0;
      for (let i = 0; i < data.length; i += 24) {
        if (data[i + 3] < 128) continue;
        lum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        n++;
      }
      if (!n) return;
      const a = Math.min(0.2, 0.04 + 0.16 * (lum / n)).toFixed(3);
      card.style.setProperty("--ft", "rgba(244, 242, 238, " + a + ")");
    } catch {
      /* tainted canvas — keep the default sheen */
    }
  }

  function setArt(img, url, card) {
    if (!url) {
      img.src = "icon.svg";
      return;
    }
    // Some cover CDNs send no CORS header. Retry once without it so the art
    // still shows, just without the sampled sheen.
    img.addEventListener("error", () => {
      img.removeAttribute("crossorigin");
      img.src = url;
    }, { once: true });
    if (card) {
      img.crossOrigin = "anonymous";
      img.addEventListener("load", () => tintFromArt(img, card), { once: true });
    }
    img.src = url;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

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

  // Mounts featured + rows. `playable` adds a 30s preview toggle on featured.
  function renderPlaylist(mount, songs, opts) {
    opts = opts || {};
    const { featuredCard, featuredArt, featuredTitle, featuredSub, rowsEl } = mount;
    const [first, ...rest] = songs;
    featuredCard.href = songPageUrl(first);
    featuredTitle.textContent = first.t;
    featuredSub.textContent = [first.a, first.al].filter(Boolean).join(" · ") || "Unknown artist";
    const fArt = featuredArt;
    if (first.art) {
      setArt(fArt, first.art, featuredCard);
    } else {
      fArt.src = "icon.svg";
      resolveArt(first.t, first.a).then((url) => {
        if (url) setArt(fArt, url, featuredCard);
      });
    }
    if (opts.playable) mountPlayer(featuredCard, first);
    rowsEl.innerHTML = "";
    rest.forEach((s, i) => {
      const row = el("a", "prow");
      row.href = songPageUrl(s);
      const n = el("span", "n", String(i + 2).padStart(2, "0"));
      const thumb = el("span", "thumb");
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = s.art || "icon.svg";
      if (!s.art) {
        resolveArt(s.t, s.a).then((url) => {
          if (url) img.src = url;
        });
      }
      thumb.appendChild(img);
      const mid = el("div");
      mid.style.minWidth = "0";
      const b = el("b", null, s.t);
      const sp = el("span", null, s.a || "Unknown artist");
      mid.appendChild(b);
      mid.appendChild(sp);
      const right = el("span");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "0.55rem";
      const logo = svcLogo(s.u || "");
      if (logo) {
        const dot = document.createElement("img");
        dot.className = "svc-dot";
        dot.alt = "";
        dot.loading = "lazy";
        dot.width = 22;
        dot.height = 22;
        dot.src = logo;
        dot.onerror = () => dot.remove();
        right.appendChild(dot);
      }
      const chev = el("span", "chev", "›");
      chev.setAttribute("aria-hidden", "true");
      right.appendChild(chev);
      row.appendChild(n);
      row.appendChild(thumb);
      row.appendChild(mid);
      row.appendChild(right);
      row.style.animationDelay = (i * 0.06).toFixed(2) + "s";
      rowsEl.appendChild(row);
    });
  }

  // Compact 30s preview toggle inside the featured card.
  function mountPlayer(featuredCard, song) {
    if (featuredCard.querySelector(".mini-play")) return;
    const btn = el("button", "mini-play");
    btn.type = "button";
    btn.setAttribute("aria-label", "Play 30 second preview");
    btn.innerHTML = "<span>▶</span>";
    const audio = document.createElement("audio");
    audio.preload = "none";
    let ready = false;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ready) {
        fetch(
          "https://itunes.apple.com/search?term=" +
            encodeURIComponent([song.t, song.a].filter(Boolean).join(" ")) +
            "&media=music&entity=song&limit=1",
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            const hit = d && d.results && d.results[0];
            if (!hit || !hit.previewUrl) {
              btn.classList.add("unavail");
              btn.title = "No preview available";
              return;
            }
            audio.src = hit.previewUrl;
            ready = true;
            audio.play().catch(() => {});
            btn.classList.add("on");
          })
          .catch(() => btn.classList.add("unavail"));
        return;
      }
      if (audio.paused) {
        audio.play().catch(() => {});
        btn.classList.add("on");
      } else {
        audio.pause();
        btn.classList.remove("on");
      }
    });
    audio.addEventListener("ended", () => btn.classList.remove("on"));
    const go = featuredCard.querySelector(".go");
    (go || featuredCard).appendChild(btn);
  }

  window.SharedList = { songPageUrl, resolveArt, renderPlaylist };
})();
