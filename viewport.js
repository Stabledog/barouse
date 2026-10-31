const viewportEl = document.getElementById("viewport");
const settingsEl = document.getElementById("settings-editor");
const errorPanelEl = document.getElementById("error-panel");
const errorMessageEl = document.getElementById("error-panel-message");
const errorOpenTabBtn = document.getElementById("error-open-tab");
const errorRetryBtn = document.getElementById("error-retry");
const landingPageEl = document.getElementById("landing-page");
const editorPaneEl = document.getElementById("editor-pane");
const editorPendingEl = document.getElementById("editor-pending");
const editorPendingTextEl = document.getElementById("editor-pending-text");

const iframes = new Map(); // url -> HTMLIFrameElement
const loadTimestamps = new Map(); // url -> number[] (recent load times)
const errorUrls = new Map(); // url -> { reason }
const zoomLevels = new Map(); // url -> number (zoom factor, default 1.0)
const navigatedUrls = new Map(); // configuredUrl -> current location.href
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

  // Hide all iframes and landing, show error panel
  for (const frame of iframes.values()) {
    frame.classList.remove("active");
  }
  settingsEl.classList.add("hidden");
  landingPageEl.classList.add("hidden");
  setEditorPaneVisible(false);
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

// --- URL tracking from content script ---

window.addEventListener("message", (event) => {
  if (event.data?.type !== "barouse:url-update" || !event.data.url) return;
  for (const [configuredUrl, iframe] of iframes) {
    if (iframe.contentWindow === event.source) {
      navigatedUrls.set(configuredUrl, event.data.url);
      break;
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
    landingPageEl.classList.add("hidden");
    setEditorPaneVisible(false);
    errorPanelEl.classList.remove("hidden");
    activeUrl = url;
    return null;
  }

  // Hide settings editor, error panel, landing page and editor
  settingsEl.classList.add("hidden");
  errorPanelEl.classList.add("hidden");
  landingPageEl.classList.add("hidden");
  setEditorPaneVisible(false);

  // Hide all iframes
  for (const frame of iframes.values()) {
    frame.classList.remove("active");
  }

  // Lazy-create iframe on first visit
  if (!iframes.has(url)) {
    const iframe = document.createElement("iframe");
    iframe.allow = "clipboard-read; clipboard-write";
    iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";
    iframe.addEventListener("load", () => {
      onIframeLoad(iframe, url);
      // Activate the content script in this iframe (enables zoom key forwarding).
      iframe.contentWindow.postMessage({ type: "barouse:init" }, "*");
      iframe.contentWindow.postMessage({ type: "barouse:activate" }, "*");
    });
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
  navigatedUrls.delete(url);
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

export function getNavigatedUrl() {
  if (!activeUrl) return null;
  return navigatedUrls.get(activeUrl) || activeUrl;
}

export function isErrored(url) {
  return errorUrls.has(url);
}

export function showSettings() {
  // Hide all iframes, error panel, landing page and editor
  for (const frame of iframes.values()) {
    frame.classList.remove("active");
  }
  errorPanelEl.classList.add("hidden");
  landingPageEl.classList.add("hidden");
  setEditorPaneVisible(false);
  activeUrl = null;
  settingsEl.classList.remove("hidden");
}

export function hideSettings() {
  settingsEl.classList.add("hidden");
}

export function showLanding() {
  for (const frame of iframes.values()) {
    frame.classList.remove("active");
  }
  settingsEl.classList.add("hidden");
  errorPanelEl.classList.add("hidden");
  setEditorPaneVisible(false);
  landingPageEl.classList.remove("hidden");
  activeUrl = null;
}

export function destroyAllIframes() {
  for (const frame of iframes.values()) {
    frame.remove();
  }
  iframes.clear();
  errorUrls.clear();
  navigatedUrls.clear();
  errorPanelEl.classList.add("hidden");
  activeUrl = null;
}

// --- Editor slot (see editor-slot.js) ---
// Kept apart from the site iframes: it isn't a configured site, so it has no
// zoom, error panel or loop detection, and destroyAllIframes (config saves)
// leaves it alone.

let editorIframe = null;
let editorVisibilityListener = () => {};

function setEditorPaneVisible(visible) {
  editorPaneEl.classList.toggle("hidden", !visible);
  editorVisibilityListener(visible);
}

// fn(visible) runs whenever the editor pane is shown or hidden.
export function onEditorVisibility(fn) {
  editorVisibilityListener = fn;
}

// onLoad runs on each load of the editor page.
export function loadEditor(url, onLoad) {
  unloadEditor();
  const iframe = document.createElement("iframe");
  iframe.allow = "clipboard-read; clipboard-write";
  iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";
  iframe.addEventListener("load", () => {
    // Turns on nav-helper.js in the editor (clipboard bridge, Alt+1-9).
    iframe.contentWindow.postMessage({ type: "barouse:init" }, "*");
    onLoad();
  });
  iframe.src = url;
  editorIframe = iframe;
  editorPaneEl.appendChild(iframe);
}

export function unloadEditor() {
  editorIframe?.remove();
  editorIframe = null;
}

export function showEditor() {
  for (const frame of iframes.values()) {
    frame.classList.remove("active");
  }
  settingsEl.classList.add("hidden");
  errorPanelEl.classList.add("hidden");
  landingPageEl.classList.add("hidden");
  activeUrl = null;
  setEditorPaneVisible(true);
  editorIframe?.contentWindow?.focus();
}

export function isEditorShown() {
  return !editorPaneEl.classList.contains("hidden");
}

export function isEditorSource(source) {
  return !!editorIframe && !!source && source === editorIframe.contentWindow;
}

export function requestEditorQuit() {
  editorIframe?.contentWindow?.postMessage({ type: "barouse:request-quit" }, "*");
}

export function setEditorPending(text) {
  editorPendingTextEl.textContent = text || "";
  editorPendingEl.classList.toggle("hidden", !text);
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
