const viewportEl = document.getElementById("viewport");
const settingsEl = document.getElementById("settings-editor");
const iframes = new Map(); // url -> HTMLIFrameElement
const loadTimestamps = new Map(); // url -> number[] (recent load times)
let activeUrl = null;

const LOOP_THRESHOLD = 3;
const LOOP_WINDOW_MS = 10000;
const bouncedUrls = new Set(); // URLs currently bounced to a tab, prevent re-entry

function bounceToTab(iframe, configuredUrl) {
  bouncedUrls.add(configuredUrl);
  loadTimestamps.delete(configuredUrl);
  iframes.delete(configuredUrl);
  iframe.remove();
  chrome.tabs.create({ url: configuredUrl });
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

export function showSite(url) {
  bouncedUrls.delete(url);

  // Hide settings editor if visible
  settingsEl.classList.add("hidden");

  // Hide all iframes
  for (const frame of iframes.values()) {
    frame.classList.remove("active");
  }

  // Lazy-create iframe on first visit
  if (!iframes.has(url)) {
    const iframe = document.createElement("iframe");
    iframe.addEventListener("load", () => onIframeLoad(iframe, url));
    iframe.src = url;
    viewportEl.appendChild(iframe);
    iframes.set(url, iframe);
  }

  // Show target iframe
  const target = iframes.get(url);
  target.classList.add("active");
  activeUrl = url;
  return target;
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

export function showSettings() {
  // Hide all iframes
  for (const frame of iframes.values()) {
    frame.classList.remove("active");
  }
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
  activeUrl = null;
}
