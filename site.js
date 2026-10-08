/* FavSongs site behaviour — mobile sheet, scroll reveal, footer year, and the
 * shared clock for every branded loop on the page.
 * The theme toggle is gone on purpose: the site has one palette now. */
(() => {
  const nav = document.getElementById("mobileNav");
  const openBtn = document.getElementById("menuOpen");
  const closeBtn = document.getElementById("menuClose");
  const backdrop = document.getElementById("mobileBackdrop");

  const setNav = (open) => {
    if (!nav) return;
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("is-locked", open);
    if (openBtn) openBtn.setAttribute("aria-expanded", String(open));
    if (open && closeBtn) closeBtn.focus();
  };

  openBtn?.addEventListener("click", () => setNav(true));
  closeBtn?.addEventListener("click", () => setNav(false));
  backdrop?.addEventListener("click", () => setNav(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setNav(false);
  });
  nav?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setNav(false)));

  // Scroll reveal.
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || !els.length) {
    els.forEach((el) => el.classList.add("is-in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => io.observe(el));
  }

  // Footer year.
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  /* The looped mark.

     Each loop only plays once it is actually on screen, so the 4 MB file never
     blocks the first paint, and every instance on the page shares one clock:
     the first playing one is the clock, so the mark sits at the same point in
     the bloom wherever it appears. Drift is corrected on timeupdate (a few
     times a second) rather than per frame, measured the short way round the
     loop so a wrap is not mistaken for drift. Reduced motion keeps the poster.

     This lives here rather than inline so a page that shows the mark further
     down (how.html) gets the same behaviour without copying the code. */
  (() => {
    const vids = [...document.querySelectorAll("video.loop")];
    if (!vids.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const TOL = 0.12;       // seconds of drift worth a seek
    const COOLDOWN = 600;   // ms after a seek before the next one
    const WAIT = 1200;      // ms a follower waits for the clock before starting
    const lastSeek = new WeakMap();
    const leading = () => vids.find((v) => !v.paused && v.readyState > 1);

    // Shortest distance round the loop: 6.9s apart on a 7s loop is 0.1s apart.
    const drift = (v, lead) => {
      const dur = lead.duration || 7;
      let d = v.currentTime - lead.currentTime;
      if (d > dur / 2) d -= dur;
      else if (d < -dur / 2) d += dur;
      return d;
    };

    const align = (lead) => {
      for (const v of vids) {
        if (v === lead || v.paused || v.seeking || v.readyState < 2) continue;
        if (Math.abs(drift(v, lead)) <= TOL) continue;
        if (Date.now() - (lastSeek.get(v) || 0) < COOLDOWN) continue;
        lastSeek.set(v, Date.now());
        try { v.currentTime = lead.currentTime; } catch { /* not seekable yet */ }
      }
    };

    const join = (v, waited) => {
      const lead = leading();
      // The first one on screen leads; a follower would rather wait a moment
      // than start the bloom over from zero while the clock is still starting.
      if (!lead && v !== vids[0] && waited < WAIT) {
        setTimeout(() => join(v, waited + 200), 200);
        return;
      }
      if (lead && lead !== v) {
        lastSeek.set(v, Date.now());
        try { v.currentTime = lead.currentTime; } catch { /* ignore */ }
      }
      if (v.play) v.play().catch(() => {});
    };

    const start = (v) => {
      if (v.readyState >= 2) { join(v, WAIT); return; }
      // A seek made before any frame exists is simply dropped, so wake the file
      // up first and join the clock as soon as there is something to seek into.
      v.preload = "auto";
      v.addEventListener("loadeddata", () => join(v, 0), { once: true });
      v.load();
    };

    const onTick = () => { const lead = leading(); if (lead) align(lead); };
    vids.forEach((v) => v.addEventListener("timeupdate", onTick));

    if (!("IntersectionObserver" in window)) { vids.forEach((v) => start(v)); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { start(e.target); io.unobserve(e.target); }
      }
    }, { rootMargin: "700px 0px" });   // wake a loop before it is on screen,
    vids.forEach((v) => io.observe(v)); // so it joins the clock already running
  })();
})();
