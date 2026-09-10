(() => {
  const root = document.documentElement;
  const themeButton = document.getElementById("themeToggle");
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  let saved;
  try {
    saved = localStorage.getItem("theme");
  } catch {
    /* Storage may be disabled. */
  }
  function applyTheme(theme) {
    root.dataset.theme = theme;
    themeButton.textContent = theme === "dark" ? "Light ↗" : "Dark ↗";
    themeButton.setAttribute(
      "aria-label",
      `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
    );
  }
  applyTheme(
    saved === "light" || saved === "dark"
      ? saved
      : preference.matches
        ? "dark"
        : "light",
  );
  themeButton.addEventListener("click", () => {
    saved = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(saved);
    try {
      localStorage.setItem("theme", saved);
    } catch {
      /* Keep the theme for this visit. */
    }
  });
  preference.addEventListener("change", (event) => {
    if (saved !== "light" && saved !== "dark")
      applyTheme(event.matches ? "dark" : "light");
  });

  const burger = document.getElementById("navBurger");
  const navigation = document.getElementById("navLinks");
  function setMenu(open) {
    navigation.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  burger.addEventListener("click", () =>
    setMenu(burger.getAttribute("aria-expanded") !== "true"),
  );
  navigation
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      burger.getAttribute("aria-expanded") === "true"
    ) {
      setMenu(false);
      burger.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav")) setMenu(false);
  });
  window
    .matchMedia("(min-width: 761px)")
    .addEventListener("change", () => setMenu(false));
  document.getElementById("year").textContent = new Date().getFullYear();
})();
