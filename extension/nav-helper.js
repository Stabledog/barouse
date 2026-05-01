(function () {
  // Only run inside iframes, not top-level pages.
  if (window === window.top) return;

  // Activation flag — only set when the parent sidebar sends barouse:init.
  // Prevents keyboard interception in iframes on regular pages.
  let inBarouse = false;

  window.addEventListener("message", (event) => {
    if (!event.data?.type) return;

    if (event.data.type === "barouse:init") {
      inBarouse = true;
      return;
    }

    if (event.data.type === "barouse:navigate") {
      if (event.data.action === "back") history.back();
      else if (event.data.action === "forward") history.forward();
    }
  });

  // Report the current URL to the parent sidebar on every navigation.
  function reportUrl() {
    window.parent.postMessage({ type: "barouse:url-update", url: location.href }, "*");
  }
  window.addEventListener("load", reportUrl);
  window.addEventListener("popstate", reportUrl);
  window.addEventListener("hashchange", reportUrl);

  // Forward zoom shortcuts to the barouse sidebar (only after activation).
  document.addEventListener("keydown", (e) => {
    if (!inBarouse) return;
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0") {
      e.preventDefault();
      window.parent.postMessage({ type: "barouse:zoom-key", key: e.key }, "*");
    }
  });
})();
