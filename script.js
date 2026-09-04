// ---------- Theme toggle (persisted, respects system pref) ----------
(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme", saved || (prefersDark ? "dark" : "light"));

  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
})();

// ---------- Mobile nav ----------
(function () {
  const burger = document.getElementById("navBurger");
  const links = document.getElementById("navLinks");
  burger.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      links.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
    })
  );
})();

// ---------- Hero word rotator ----------
(function () {
  const words = ["AI systems", "LLM agents", "RAG pipelines", "dev tools", "math benchmarks"];
  const el = document.getElementById("rotator");
  let i = 0;
  setInterval(() => {
    el.style.opacity = 0;
    setTimeout(() => {
      i = (i + 1) % words.length;
      el.textContent = words[i];
      el.style.opacity = 1;
    }, 300);
  }, 2600);
})();

// ---------- Scroll reveal ----------
(function () {
  const targets = document.querySelectorAll(
    ".tl-item, .proj, .act, .pub, .about__edu, .contact"
  );
  targets.forEach((t) => t.classList.add("reveal"));
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.12 }
  );
  targets.forEach((t) => io.observe(t));
})();

// ---------- Footer year ----------
document.getElementById("year").textContent = new Date().getFullYear();
