(function () {
  var d = document,
    b = d.body,
    mb = d.getElementById("mb"),
    bd = d.getElementById("bd");
  function op(v) {
    b.classList.toggle("open", v);
    mb.setAttribute("aria-expanded", v);
  }
  mb.onclick = function () {
    op(!b.classList.contains("open"));
  };
  bd.onclick = function () {
    op(false);
  };
  addEventListener("keydown", function (e) {
    if (e.key === "Escape") op(false);
  });
  d.getElementById("sb").addEventListener("click", function (e) {
    if (e.target.closest("a")) op(false);
  });
  d.getElementById("th").onclick = function () {
    var r = d.documentElement,
      cur =
        r.dataset.theme ||
        (matchMedia("(prefers-color-scheme:light)").matches ? "light" : "dark"),
      n = cur === "dark" ? "light" : "dark";
    r.dataset.theme = n;
    try {
      localStorage.setItem("rgos-theme", n);
    } catch (e) {}
  };
  var on = d.querySelector("#sb a.on");
  if (on && on.scrollIntoView && innerWidth > 900)
    on.scrollIntoView({ block: "nearest" });
})();
