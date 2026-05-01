const viewportEl = document.getElementById("viewport");
const settingsEl = document.getElementById("settings-editor");
const errorPanelEl = document.getElementById("error-panel");
const errorMessageEl = document.getElementById("error-panel-message");
const errorOpenTabBtn = document.getElementById("error-open-tab");
const errorRetryBtn = document.getElementById("error-retry");

const iframes = new Map(); // url -> HTMLIFrameElement
const loadTimestamps = new Map(); // url -> number[] (recent load times)
const errorUrls = new Map(); // url -> { reason }
const zoomLevels = new Map(); // url -> number (zoom factor, default 1.0)
let activeUrl = null;

const LOOP_THRESHOLD = 3;
const LOOP_WINDOW_MS = 10000;
const bouncedUrls = new Set(); // URLs currently bounced to a tab, prevent re-entry

// --- Error panel ---

function showError(url, reason) {
  // Remove iframe if it exists
  const iframe = iframes.get(url);
  if (iframe) {
    iframe.remove();
    iframes.delete(url);
  }
  loadTimestamps.delete(url);
  bouncedUrls.add(url);

  errorUrls.set(url, { reason });

  // Update panel text
  if (reason === "auth") {
    errorMessageEl.textContent =
      "This site requires authentication. It has been opened in a new tab.";
  } else {
    errorMessageEl.textContent =
      "This site cannot be displayed in Barouse. It has been opened in a new tab.";
  }

  // Hide all iframes, show error panel
  for (const frame of iframes.values()) {
    frame.classList.remove("active");
  }
  settingsEl.classList.add("hidden");
  errorPanelEl.classList.remove("hidden");
  activeUrl = url;

  chrome.tabs.create({ url });
}

function clearError(url) {
  errorUrls.delete(url);
  errorPanelEl.classList.add("hidden");
}

// --- Error panel button wiring ---

let errorPanelUrl = null; // track which URL the panel buttons act on

function showErrorPanel(url) {
  errorPanelUrl = url;
  showError(url, errorUrls.get(url)?.reason || "http");
}

errorOpenTabBtn.addEventListener("click", () => {
  if (errorPanelUrl) chrome.tabs.create({ url: errorPanelUrl });
});

errorRetryBtn.addEventListener("click", () => {
  if (errorPanelUrl) retrySite(errorPanelUrl);
});

// --- Bounce / loop detection ---

function bounceToTab(iframe, configuredUrl) {
  showError(configuredUrl, "auth");
}

function onIframeLoad(iframe, configuredUrl) {
  if (bouncedUrls.has(configuredUrl)) return;

  // Track rapid load events to detect auth redirect loops.
  const now = Date.now();
  const timestamps = loadTimestamps.get(configuredUrl) || [];
  timestamps.push(now);
  const recent = timestamps.filter(t => now - t < LOOP_WINDOW_MS);
  loadTimestamps.set(configuredUrl, recent);

  if (recent.length >= LOOP_THRESHOLD) {
    bounceToTab(iframe, configuredUrl);
    return;
  }

  // Catch direct error pages (chrome-error://)
  try {
    const doc = iframe.contentDocument;
    if (doc && iframe.src !== "about:blank") {
      bounceToTab(iframe, configuredUrl);
    }
  } catch (e) {
    // SecurityError — cross-origin page loaded successfully
  }
}

// --- HTTP error messages from background ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "iframe-http-error") return;

  // Match the error URL's origin against active iframes
  let errorOrigin;
  try {
    errorOrigin = new URL(msg.url).origin;
  } catch {
    return;
  }

  for (const [configuredUrl] of iframes) {
    try {
      if (new URL(configuredUrl).origin === errorOrigin) {
        showError(configuredUrl, "http");
        return;
      }
    } catch {
      // invalid configured URL — skip
    }
  }
});

// --- Public API ---

export function showSite(url) {
  bouncedUrls.delete(url);

  // If this URL is in error state, show the error panel
  if (errorUrls.has(url)) {
    errorPanelUrl = url;
    // Re-show the panel (text is already set)
    for (const frame of iframes.values()) {
      frame.classList.remove("active");
    }
    settingsEl.classList.add("hidden");
    errorPanelEl.classList.remove("hidden");
    activeUrl = url;
    return null;
  }

  // Hide settings editor and error panel
  settingsEl.classList.add("hidden");
  errorPanelEl.classList.add("hidden");

  // Hide all iframes
  for (const frame of iframes.values()) {
    frame.classList.remove("active");
  }

  // Lazy-create iframe on first visit
  if (!iframes.has(url)) {
    const iframe = document.createElement("iframe");
    iframe.addEventListener("load", () => onIframeLoad(iframe, url));
    iframe.src = url;
    iframes.set(url, iframe);
    applyZoom(url);
    viewportEl.appendChild(iframe);
  }

  // Show target iframe
  const target = iframes.get(url);
  target.classList.add("active");
  activeUrl = url;
  return target;
}

export function retrySite(url) {
  clearError(url);
  bouncedUrls.delete(url);
  // Force fresh iframe by removing stale entry
  const old = iframes.get(url);
  if (old) {
    old.remove();
    iframes.delete(url);
  }
  loadTimestamps.delete(url);
  showSite(url);
}

export function resetSite(url) {
  const iframe = iframes.get(url);
  if (iframe) {
    iframe.src = url;
  }
}

export function getActiveIframe() {
  if (!activeUrl) return null;
  return iframes.get(activeUrl) || null;
}

export function getActiveUrl() {
  return activeUrl;
}

export function isErrored(url) {
  return errorUrls.has(url);
}

export function showSettings() {
  // Hide all iframes and error panel
  for (const frame of iframes.values()) {
    frame.classList.remove("active");
  }
  errorPanelEl.classList.add("hidden");
  activeUrl = null;
  settingsEl.classList.remove("hidden");
}

export function hideSettings() {
  settingsEl.classList.add("hidden");
}

export function destroyAllIframes() {
  for (const frame of iframes.values()) {
    frame.remove();
  }
  iframes.clear();
  errorUrls.clear();
  errorPanelEl.classList.add("hidden");
  activeUrl = null;
}

// --- Zoom ---

const ZOOM_KEY = "barouse_zoom_levels";
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;

function applyZoom(url) {
  const iframe = iframes.get(url);
  if (!iframe) return;
  const z = zoomLevels.get(url) || 1.0;
  if (z === 1.0) {
    iframe.style.transform = "";
    iframe.style.transformOrigin = "";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
  } else {
    iframe.style.transform = `scale(${z})`;
    iframe.style.transformOrigin = "0 0";
    iframe.style.width = `${100 / z}%`;
    iframe.style.height = `${100 / z}%`;
  }
}

function saveZoom() {
  const obj = Object.fromEntries(zoomLevels);
  chrome.storage.local.set({ [ZOOM_KEY]: obj });
}

export async function loadZoom() {
  const result = await chrome.storage.local.get(ZOOM_KEY);
  const obj = result[ZOOM_KEY];
  if (obj && typeof obj === "object") {
    for (const [url, level] of Object.entries(obj)) {
      zoomLevels.set(url, level);
    }
  }
}

export function setZoom(url, level) {
  const clamped = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level)) * 10) / 10;
  if (clamped === 1.0) {
    zoomLevels.delete(url);
  } else {
    zoomLevels.set(url, clamped);
  }
  applyZoom(url);
  saveZoom();
}

export function getZoom(url) {
  return zoomLevels.get(url) || 1.0;
}

export function getActiveZoom() {
  return activeUrl ? getZoom(activeUrl) : 1.0;
}

// --- Navigation ---

export function goBack() {
  if (!activeUrl) return;
  const iframe = iframes.get(activeUrl);
  if (iframe) {
    iframe.contentWindow.postMessage({ type: "barouse:navigate", action: "back" }, "*");
  }
}

export function goForward() {
  if (!activeUrl) return;
  const iframe = iframes.get(activeUrl);
  if (iframe) {
    iframe.contentWindow.postMessage({ type: "barouse:navigate", action: "forward" }, "*");
  }
}
