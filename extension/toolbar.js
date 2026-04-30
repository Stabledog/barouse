const toolbarEl = document.getElementById("toolbar");
let buttons = [];

export function renderToolbar(config, callbacks) {
  toolbarEl.innerHTML = "";
  buttons = [];

  // Site buttons
  config.sites.forEach((site, i) => {
    const btn = document.createElement("button");
    btn.title = site.label;
    btn.dataset.index = i;

    const img = document.createElement("img");
    const domain = new URL(site.url).hostname;
    img.src = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
    img.alt = site.label;
    img.onerror = () => {
      img.remove();
      btn.textContent = site.label.charAt(0).toUpperCase();
    };
    btn.appendChild(img);

    btn.addEventListener("click", () => callbacks.onSiteClick(i));
    toolbarEl.appendChild(btn);
    buttons.push(btn);
  });

  // Capture-tab button
  const captureBtn = document.createElement("button");
  captureBtn.title = "Capture tab";
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
  gearBtn.title = "Settings";
  gearBtn.textContent = "\u2699";
  gearBtn.addEventListener("click", () => callbacks.onSettingsClick());
  toolbarEl.appendChild(gearBtn);
}

export function setActiveButton(index) {
  buttons.forEach((btn, i) => {
    btn.classList.toggle("active", i === index);
  });
}
