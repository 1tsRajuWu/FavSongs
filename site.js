/* FavSongs site behaviour — mobile sheet, scroll reveal, footer year.
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
})();
