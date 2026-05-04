(function () {
  // Podifill: inject apps localStorage for notehub.web and metabrowse
  (function () {
    const path = location.pathname;
    const isNotehub = path.includes("/notehub.web/");
    const isMetabrowse = path.includes("/metabrowse/");
    if (!isNotehub && !isMetabrowse) return;

    chrome.storage.local.get("podifill_apps_config").then((result) => {
      const cfg = result.podifill_apps_config;
      if (!cfg || !cfg.token || !cfg.host) return;
      if (location.hostname !== cfg.host) return;

      localStorage.setItem("notehub:token", cfg.token);
      localStorage.setItem("notehub:host", cfg.host);
      if (isNotehub && cfg.notehub_default_repo) {
        localStorage.setItem("notehub:defaultRepo", cfg.notehub_default_repo);
      }
      if (isMetabrowse) {
        if (cfg.metabrowse_owner) localStorage.setItem("metabrowse:owner", cfg.metabrowse_owner);
        if (cfg.metabrowse_repo) localStorage.setItem("metabrowse:repo", cfg.metabrowse_repo);
      }
    }).catch(() => {});
  })();

  // Workspace API relay — works on ALL pages (top-level and iframes).
  // Forwards barouse:* workspace messages from the page to the background
  // service worker and posts the response back with a "-result" suffix.
  const WORKSPACE_TYPES = ["barouse:ping", "barouse:query-tabs", "barouse:open-workspace"];

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data?.type) return;
    if (!WORKSPACE_TYPES.includes(event.data.type)) return;

    chrome.runtime.sendMessage(event.data).then((response) => {
      window.postMessage({ type: event.data.type + "-result", payload: response }, "*");
    }).catch(() => {
      window.postMessage({ type: event.data.type + "-result", payload: null, error: true }, "*");
    });
  });

  // Top-level pages: forward Alt+1-9 to the sidebar via chrome.runtime.
  if (window === window.top) {
    document.addEventListener("keydown", (e) => {
      if (!e.altKey) return;
      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: "barouse:switch-tab", index: parseInt(e.key, 10) - 1 }).catch(() => {});
      }
    });
    return;
  }

  // Everything below only runs inside iframes, not top-level pages.

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

  // Forward keyboard shortcuts to the barouse sidebar (only after activation).
  document.addEventListener("keydown", (e) => {
    if (!inBarouse) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0")) {
      e.preventDefault();
      window.parent.postMessage({ type: "barouse:zoom-key", key: e.key }, "*");
    }
    if (e.altKey && e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      window.parent.postMessage({ type: "barouse:switch-tab", index: parseInt(e.key, 10) - 1 }, "*");
    }
  });
})();
