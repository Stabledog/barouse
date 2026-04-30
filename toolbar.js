const toolbarEl = document.getElementById("toolbar");
let buttons = [];

export function renderToolbar(config, callbacks) {
  toolbarEl.innerHTML = "";
  buttons = [];

  // Site buttons
  config.sites.forEach((site, i) => {
    const btn = document.createElement("button");
    btn.dataset.tooltip = site.label;
    btn.dataset.index = i;

    const img = document.createElement("img");
    const siteUrl = new URL(site.url);
    // Try direct favicon from the site's path, then origin root, then letter.
    // Google's favicon service is intentionally skipped: it always returns a valid
    // image (grey globe) for unknown/internal domains, so onerror never fires and
    // the grey placeholder gets stuck. Direct fetches correctly trigger onerror on
    // CORP blocks or 404s, letting the letter fallback work reliably.
    const pathBase = siteUrl.pathname.replace(/\/?$/, "/");
    const pathFavicon = `${siteUrl.origin}${pathBase}favicon.ico`;
    const originFavicon = `${siteUrl.origin}/favicon.ico`;
    const showLetter = () => {
      img.remove();
      btn.textContent = site.label.charAt(0).toUpperCase();
    };
    img.src = pathFavicon;
    img.alt = site.label;
    img.onerror = () => {
      if (img.src !== originFavicon) {
        img.onerror = () => showLetter();
        img.src = originFavicon;
      } else {
        showLetter();
      }
    };
    btn.appendChild(img);

    btn.addEventListener("click", () => callbacks.onSiteClick(i));
    toolbarEl.appendChild(btn);
    buttons.push(btn);
  });

  // Capture-tab button
  const captureBtn = document.createElement("button");
  captureBtn.dataset.tooltip = "Capture tab";
  captureBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M6 3H3v10h10v-3"/>
    <path d="M9 2h5v5"/>
    <path d="M14 2L7 9"/>
  </svg>`;
  captureBtn.addEventListener("click", () => callbacks.onCaptureClick());
  toolbarEl.appendChild(captureBtn);

  // Gear button (pinned to bottom)
  const gearBtn = document.createElement("button");
  gearBtn.className = "gear-btn";
  gearBtn.dataset.tooltip = "Settings";
  gearBtn.textContent = "\u2699";
  gearBtn.addEventListener("click", () => callbacks.onSettingsClick());
  toolbarEl.appendChild(gearBtn);
}

export function setActiveButton(index) {
  buttons.forEach((btn, i) => {
    btn.classList.toggle("active", i === index);
  });
}
