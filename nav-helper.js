(function () {
  // Only run inside iframes, not top-level pages.
  if (window === window.top) return;

  window.addEventListener("message", (event) => {
    if (event.data?.type !== "barouse:navigate") return;
    if (event.data.action === "back") history.back();
    else if (event.data.action === "forward") history.forward();
  });
})();
