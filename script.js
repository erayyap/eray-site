// theme toggle (persisted, respects system preference)
(function () {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    btn.textContent = theme === "dark" ? "light" : "dark";
  }
  apply(saved || (prefersDark ? "dark" : "light"));

  btn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    apply(next);
    localStorage.setItem("theme", next);
  });
})();

// mobile nav
(function () {
  const burger = document.getElementById("navBurger");
  const links = document.getElementById("navLinks");
  burger.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => links.classList.remove("open"))
  );
})();

// footer year
document.getElementById("year").textContent = new Date().getFullYear();
