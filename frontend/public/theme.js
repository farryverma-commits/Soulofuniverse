(function () {
  try {
    var t = localStorage.getItem("sou-theme");
    if (!t) {
      t = window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    }
    document.documentElement.setAttribute("data-theme", t);
  } catch {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
