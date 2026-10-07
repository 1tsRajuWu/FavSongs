/* FavSongs site — shared behaviour (no build step). */
(() => {
  const root = document.documentElement;

  // Theme: respect saved choice, default dark.
  try {
    const saved = localStorage.getItem("favsongs.theme");
    if (saved === "light" || saved === "dark") root.dataset.theme = saved;
    else root.dataset.theme = "dark";
  } catch { root.dataset.theme = root.dataset.theme || "dark"; }

  const syncThemeIcon = () => {
    document.querySelectorAll("[data-theme-icon]").forEach((el) => {
      el.textContent = root.dataset.theme === "light" ? "☾" : "☀";
    });
  };
  syncThemeIcon();

  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
      try { localStorage.setItem("favsongs.theme", root.dataset.theme); } catch {}
      syncThemeIcon();
    });
  });

  // Mobile nav.
  const nav = document.getElementById("mobileNav");
  const openBtn = document.getElementById("menuOpen");
  const closeBtn = document.getElementById("menuClose");
  const backdrop = document.getElementById("mobileBackdrop");
  const setNav = (open) => {
    if (!nav) return;
    nav.classList.toggle("is-open", open);
    document.body.style.overflow = open ? "hidden" : "";
    openBtn?.setAttribute("aria-expanded", String(open));
  };
  openBtn?.addEventListener("click", () => setNav(true));
  closeBtn?.addEventListener("click", () => setNav(false));
  backdrop?.addEventListener("click", () => setNav(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setNav(false); });
  nav?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setNav(false)));

  // Scroll reveal.
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || !els.length) {
    els.forEach((el) => el.classList.add("is-in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => io.observe(el));
  }

  // OS detection → highlight recommended download + helper line.
  const detectOS = () => {
    const ua = navigator.userAgent || "";
    const plat = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
    const s = `${ua} ${plat}`.toLowerCase();
    if (s.includes("mac") && (s.includes("arm") || s.includes("aarch64"))) return "mac-arm64";
    if (s.includes("mac")) {
      // Apple Silicon Macs report Intel unless Rosetta; default arm for modern.
      return "mac-arm64";
    }
    if (s.includes("win")) return "windows";
    if (s.includes("linux")) return s.includes("deb") ? "linux-deb" : "linux-appimage";
    if (s.includes("android")) return "windows";
    if (s.includes("iphone") || s.includes("ipad")) return "mac-arm64";
    return null;
  };
  const osKey = detectOS();
  const labels = {
    windows: "Windows 10/11 (64-bit)",
    "mac-arm64": "macOS Apple Silicon",
    "mac-x64": "macOS Intel",
    "linux-appimage": "Linux (AppImage)",
    "linux-deb": "Linux (.deb)",
  };
  document.querySelectorAll("[data-os-detect]").forEach((el) => {
    if (osKey && labels[osKey]) {
      el.hidden = false;
      el.innerHTML = `Detected <strong>${labels[osKey]}</strong> — highlighted below.`;
    }
  });
  if (osKey) {
    document.querySelectorAll(`[data-platform="${osKey}"]`).forEach((row) => {
      row.classList.add("is-rec");
      const plat = row.querySelector(".dl-plat");
      if (plat && !plat.querySelector(".pill-rec")) {
        const pill = document.createElement("span");
        pill.className = "pill-rec";
        pill.textContent = "For you";
        plat.appendChild(pill);
      }
    });
  }

  // Footer year.
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  // Presence simulator (home page only).
  const simData = {
    gaming: { kicker: "Playing Valorant", title: "Valorant", sub: "Ascent · Jett · Competitive 3-stack", art: "🎯", chip: "Gaming" },
    coding: { kicker: "Coding in Cursor", title: "milo-site — styles.css", sub: "Editing · Project Milo · 24 min", art: "💻", chip: "Coding" },
    music: { kicker: "Listening to Spotify", title: "Night Dancer — imase", sub: "Album · late replay · 02:14", art: "🎧", chip: "Music" },
    food: { kicker: "Eating", title: "Ramen break", sub: "Warm bowl · notifications off", art: "🍜", chip: "Food" },
    chill: { kicker: "Chilling", title: "Late-night lo-fi", sub: "Lights low · playlist on", art: "🌙", chip: "Chill" },
    anime: { kicker: "Watching anime", title: "Frieren — EP 14", sub: "Favorite arc · queue 3 left", art: "✨", chip: "Anime" },
    study: { kicker: "Studying", title: "Focus session 02", sub: "Deep work · 48 min left", art: "📚", chip: "Study" },
  };
  const simBtns = document.querySelectorAll("[data-sim]");
  const dKicker = document.getElementById("discordKicker");
  const dTitle = document.getElementById("discordTitle");
  const dSub = document.getElementById("discordSub");
  const dArt = document.getElementById("discordArt");
  const hAvatar = document.getElementById("heroAvatar");
  const hKicker = document.getElementById("heroKicker");
  const hTitle = document.getElementById("heroTitle");
  const hState = document.getElementById("heroState");
  const setSim = (key) => {
    const d = simData[key];
    if (!d) return;
    simBtns.forEach((b) => {
      const on = b.dataset.sim === key;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    if (dKicker) dKicker.textContent = d.kicker.toUpperCase();
    if (dTitle) dTitle.textContent = d.title;
    if (dSub) dSub.textContent = d.sub;
    if (dArt) { dArt.textContent = d.art; dArt.style.transform = "scale(0.6) rotate(-12deg)"; requestAnimationFrame(() => { dArt.style.transition = "transform .35s cubic-bezier(.34,1.56,.64,1)"; dArt.style.transform = "none"; }); }
    if (hAvatar) hAvatar.textContent = d.art;
    if (hKicker) hKicker.textContent = d.kicker;
    if (hTitle) hTitle.textContent = d.title;
    if (hState) hState.textContent = d.sub;
  };
  simBtns.forEach((b) => b.addEventListener("click", () => setSim(b.dataset.sim)));
  // Gentle auto-cycle until the user interacts.
  let simTimer = null;
  if (simBtns.length) {
    const keys = Object.keys(simData);
    let i = 0;
    simTimer = setInterval(() => {
      if (document.hidden) return;
      i = (i + 1) % keys.length;
      setSim(keys[i]);
    }, 4500);
    simBtns.forEach((b) => b.addEventListener("click", () => { if (simTimer) { clearInterval(simTimer); simTimer = null; } }, { once: true }));
  }
})();
