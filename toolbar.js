const toolbarEl = document.getElementById("toolbar");
let buttons = [];
let editorBtn = null;
let editorSlot = null; // { label, onClick } while an editor is open, else null
let editorActive = false;

export function renderToolbar(config, callbacks) {
  toolbarEl.innerHTML = "";
  buttons = [];

  // Site buttons
  config.sites.forEach((site, i) => {
    const btn = document.createElement("button");
    btn.dataset.tooltip = i < 9 ? `${site.label}  Alt+${i + 1}` : site.label;
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

  // Editor slot button (setEditorButton), between the sites and capture
  editorBtn = null;
  if (editorSlot) renderEditorButton();

  // Capture-tab button
  const captureBtn = document.createElement("button");
  captureBtn.dataset.tooltip = "Capture tab";
  captureBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M6 3H3v10h10v-3"/>
    <path d="M9 2h5v5"/>
    <path d="M14 2L7 9"/>
  </svg>`;
  captureBtn.className = "capture-btn";
  captureBtn.addEventListener("click", () => callbacks.onCaptureClick());
  toolbarEl.appendChild(captureBtn);

  // Home button (pinned to bottom with gear)
  const homeBtn = document.createElement("button");
  homeBtn.className = "home-btn";
  homeBtn.dataset.tooltip = "Home";
  homeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M3 8l5-5 5 5"/>
    <path d="M4 7v6h3v-3h2v3h3V7"/>
  </svg>`;
  homeBtn.addEventListener("click", () => callbacks.onHomeClick());
  toolbarEl.appendChild(homeBtn);

  // Gear button (follows home at bottom)
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

function renderEditorButton() {
  editorBtn = document.createElement("button");
  editorBtn.className = "editor-btn";
  editorBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M11 2l3 3-8 8H3v-3z"/>
    <path d="M9 4l3 3"/>
  </svg>`;
  editorBtn.dataset.tooltip = `veditor: ${editorSlot.label}`;
  editorBtn.classList.toggle("active", editorActive);
  editorBtn.addEventListener("click", () => editorSlot.onClick());
  toolbarEl.insertBefore(editorBtn, toolbarEl.querySelector(".capture-btn"));
}

// Shows the editor slot button ({ label, onClick }), or removes it (null).
export function setEditorButton(slot) {
  editorSlot = slot;
  editorBtn?.remove();
  editorBtn = null;
  if (slot) renderEditorButton();
}

export function setEditorButtonActive(active) {
  editorActive = active;
  editorBtn?.classList.toggle("active", active);
}
