let menuEl = null;
let callbacks = null;
let targetSiteIndex = -1;

export function initContextMenu(cb) {
  callbacks = cb;
  menuEl = document.getElementById("context-menu");

  const items = {
    reload:    document.getElementById("ctx-reload"),
    back:      document.getElementById("ctx-back"),
    forward:   document.getElementById("ctx-forward"),
    zoomIn:    document.getElementById("ctx-zoom-in"),
    zoomOut:   document.getElementById("ctx-zoom-out"),
    zoomReset: document.getElementById("ctx-zoom-reset"),
    copyUrl:   document.getElementById("ctx-copy-url"),
    launchTab: document.getElementById("ctx-launch-tab"),
    removeSite: document.getElementById("ctx-remove-site"),
  };

  function wireItem(el, handler) {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!el.classList.contains("disabled")) handler();
      menuEl.classList.add("hidden");
    });
  }

  wireItem(items.reload,    () => callbacks.onReload());
  wireItem(items.back,      () => callbacks.onBack());
  wireItem(items.forward,   () => callbacks.onForward());
  wireItem(items.zoomIn,    () => callbacks.onZoomIn());
  wireItem(items.zoomOut,   () => callbacks.onZoomOut());
  wireItem(items.zoomReset, () => callbacks.onZoomReset());
  wireItem(items.copyUrl,   () => callbacks.onCopyUrl());
  wireItem(items.launchTab, () => callbacks.onLaunchTab());
  wireItem(items.removeSite, () => callbacks.onRemoveSite(targetSiteIndex));

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    const hasActive = !!callbacks.getActiveUrl();

    // Detect if a site toolbar button was right-clicked
    const siteBtn = e.target.closest('#toolbar button[data-index]');
    targetSiteIndex = siteBtn ? parseInt(siteBtn.dataset.index, 10) : -1;
    items.removeSite.classList.toggle("disabled", targetSiteIndex === -1);

    // Navigation items require an active site
    items.reload.classList.toggle("disabled", !hasActive);
    items.back.classList.toggle("disabled", !hasActive);
    items.forward.classList.toggle("disabled", !hasActive);
    items.copyUrl.classList.toggle("disabled", !hasActive);
    items.launchTab.classList.toggle("disabled", !hasActive);

    // Zoom items require an active site too
    items.zoomIn.classList.toggle("disabled", !hasActive);
    items.zoomOut.classList.toggle("disabled", !hasActive);
    items.zoomReset.classList.toggle("disabled", !hasActive);

    // Update zoom label with current percentage
    if (hasActive) {
      const pct = Math.round(callbacks.getActiveZoom() * 100);
      items.zoomReset.textContent = `Reset zoom (${pct}%)`;
    } else {
      items.zoomReset.textContent = "Reset zoom";
    }

    // Position near cursor, clamp to right edge
    const estimatedWidth = 180;
    const x = Math.max(0, Math.min(e.clientX, window.innerWidth - estimatedWidth));
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${e.clientY}px`;
    menuEl.classList.remove("hidden");
  });

  function hideMenu() {
    menuEl.classList.add("hidden");
  }

  document.addEventListener("click", hideMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideMenu();
  });

  // Close when mouse leaves the menu
  menuEl.addEventListener("mouseleave", hideMenu);
}
