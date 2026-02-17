(function () {
  // --- Mobile nav toggle ---
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    // close when clicking a link
    navLinks.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        navLinks.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // --- Smooth scroll (native-ish) ---
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // --- Print button ---
  const printBtn = document.getElementById("printBtn");
  if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
  }

  // --- Theme toggle (persisted) ---
  const themeBtn = document.getElementById("themeBtn");
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "" : "dark";
    if (next) document.documentElement.setAttribute("data-theme", next);
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", next || "light");
  }

  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

  // --- Last updated ---
  const lastUpdated = document.getElementById("lastUpdated");
  if (lastUpdated) {
    const d = new Date();
    const fmt = d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    lastUpdated.textContent = `Last updated: ${fmt}`;
  }

  // --- Publications filter ---
  const pubSearch = document.getElementById("pubSearch");
  const pubYear = document.getElementById("pubYear");
  const pubList = document.getElementById("pubList");

  function applyPubFilter() {
    if (!pubList) return;

    const q = (pubSearch?.value || "").trim().toLowerCase();
    const y = (pubYear?.value || "").trim();

    pubList.querySelectorAll("li").forEach(li => {
      const text = li.textContent.toLowerCase();
      const liYear = li.getAttribute("data-year") || "";

      const okText = !q || text.includes(q);
      const okYear = !y || liYear === y;

      li.style.display = (okText && okYear) ? "" : "none";
    });
  }

  if (pubSearch) pubSearch.addEventListener("input", applyPubFilter);
  if (pubYear) pubYear.addEventListener("change", applyPubFilter);
})();