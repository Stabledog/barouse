import { loadConfig, saveConfig } from "./config.js";
import { renderToolbar, setActiveButton } from "./toolbar.js";
import * as viewport from "./viewport.js";
import { syncDnrRules } from "./dnr.js";
import { captureTab } from "./capture.js";
import { openSettingsEditor, closeSettingsEditor } from "./settings-editor.js";
import { initContextMenu } from "./context-menu.js";

let config = null;
let currentActive = -1;

function switchToSite(i) {
  if (!config || i < 0 || i >= config.sites.length) return;
  const site = config.sites[i];
  if (i === currentActive) {
    if (viewport.isErrored(site.url)) {
      viewport.retrySite(site.url);
    } else {
      viewport.resetSite(site.url);
    }
  } else {
    viewport.showSite(site.url);
    setActiveButton(i);
    currentActive = i;
    saveActiveSite(site.url);
  }
}

const ACTIVE_SITE_KEY = "barouse_active_site";

function saveActiveSite(url) {
  chrome.storage.local.set({ [ACTIVE_SITE_KEY]: url || null });
}

// --- Add Site Dialog ---

const addSiteDialog = document.getElementById("add-site-dialog");
const addSiteUrlEl = document.getElementById("add-site-url");
const addSiteLabelInput = document.getElementById("add-site-label");
const addSiteSaveBtn = document.getElementById("add-site-save");
const addSiteCancelBtn = document.getElementById("add-site-cancel");
const addSiteCopyBtn = document.getElementById("add-site-copy");

function showAddSiteDialog(tab) {
  addSiteUrlEl.textContent = tab.url;
  addSiteUrlEl.href = tab.url;
  addSiteLabelInput.value = (tab.title || "").slice(0, 20);
  addSiteDialog.classList.remove("hidden");
  addSiteLabelInput.focus();
  addSiteLabelInput.select();
}

function hideAddSiteDialog() {
  addSiteDialog.classList.add("hidden");
}

addSiteSaveBtn.addEventListener("click", async () => {
  const label = addSiteLabelInput.value.trim();
  if (!label) return;
  const url = addSiteUrlEl.textContent;

  if (config.sites.some(s => s.url === url)) {
    hideAddSiteDialog();
    return;
  }

  config.sites.push({ url, label });
  await saveConfig(config);
  hideAddSiteDialog();
  viewport.destroyAllIframes();
  wireToolbar();
  await syncDnrRules(config.sites);
  currentActive = -1;
  saveActiveSite(null);
  populateLandingSites(config.sites);
  viewport.showLanding();
});

addSiteCancelBtn.addEventListener("click", hideAddSiteDialog);

addSiteCopyBtn.addEventListener("click", async () => {
  const url = addSiteUrlEl.textContent;
  await navigator.clipboard.writeText(url);
  addSiteCopyBtn.textContent = "Copied";
  setTimeout(() => { addSiteCopyBtn.textContent = "Copy"; }, 1500);
});

function wireToolbar() {
  renderToolbar(config, {
    onSiteClick(i) {
      switchToSite(i);
    },

    async onCaptureClick() {
      const iframe = viewport.getActiveIframe();
      const result = await captureTab(iframe);
      if (!result.handled && result.tab) {
        showAddSiteDialog(result.tab);
      }
    },

    onSettingsClick() {
      viewport.showSettings();
      setActiveButton(-1);
      currentActive = -1;
      saveActiveSite(null);

      openSettingsEditor(config, async (newConfig) => {
        // Save
        await saveConfig(newConfig);
        config = newConfig;
        closeSettingsEditor();
        viewport.hideSettings();
        viewport.destroyAllIframes();
        wireToolbar();
        await syncDnrRules(config.sites);
        currentActive = -1;
        saveActiveSite(null);
        populateLandingSites(config.sites);
        viewport.showLanding();
      }, () => {
        // Cancel — return to previously active site or just hide editor
        closeSettingsEditor();
        viewport.hideSettings();
      });
    },

    onHomeClick() {
      viewport.showLanding();
      setActiveButton(-1);
      currentActive = -1;
      saveActiveSite(null);
    }
  });
}

// --- Zoom shortcuts ---

function handleZoomKey(key) {
  const url = viewport.getActiveUrl();
  if (!url) return;
  if (key === "=" || key === "+") {
    viewport.setZoom(url, viewport.getZoom(url) + 0.1);
  } else if (key === "-") {
    viewport.setZoom(url, viewport.getZoom(url) - 0.1);
  } else if (key === "0") {
    viewport.setZoom(url, 1.0);
  }
}

// Sidebar-focused shortcuts
document.addEventListener("keydown", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  if (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0") {
    e.preventDefault();
    handleZoomKey(e.key);
  }
  if (e.key >= "1" && e.key <= "9") {
    e.preventDefault();
    switchToSite(parseInt(e.key, 10) - 1);
  }
});

// Forwarded from content script when iframe has focus
window.addEventListener("message", (event) => {
  if (event.data?.type === "barouse:zoom-key") {
    handleZoomKey(event.data.key);
  }
  if (event.data?.type === "barouse:switch-tab") {
    switchToSite(event.data.index);
  }
});

function populateLandingSites(sites) {
  const container = document.getElementById("landing-sites");
  if (sites.length === 0) {
    container.innerHTML = "<p>No sites configured. Click the gear icon to add sites.</p>";
    return;
  }
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Label</th><th>URL</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const site of sites) {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = site.label;
    const tdUrl = document.createElement("td");
    tdUrl.className = "landing-url";
    tdUrl.textContent = new URL(site.url).hostname;
    tdUrl.title = site.url;
    tr.appendChild(tdLabel);
    tr.appendChild(tdUrl);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

async function init() {
  config = await loadConfig();
  await viewport.loadZoom();

  // Populate landing page
  document.querySelector(".landing-version").textContent =
    `v${chrome.runtime.getManifest().version}`;
  populateLandingSites(config.sites);

  wireToolbar();
  await syncDnrRules(config.sites);

  // Restore last active site
  const stored = await chrome.storage.local.get(ACTIVE_SITE_KEY);
  const savedUrl = stored[ACTIVE_SITE_KEY];
  if (savedUrl) {
    const idx = config.sites.findIndex(s => s.url === savedUrl);
    if (idx !== -1) {
      viewport.showSite(config.sites[idx].url);
      setActiveButton(idx);
      currentActive = idx;
    }
  }

  initContextMenu({
    getActiveUrl: () => viewport.getActiveUrl(),
    getActiveZoom: () => viewport.getActiveZoom(),
    onReload() {
      const url = viewport.getActiveUrl();
      if (url) viewport.resetSite(url);
    },
    onBack()    { viewport.goBack(); },
    onForward() { viewport.goForward(); },
    onZoomIn() {
      const url = viewport.getActiveUrl();
      if (url) viewport.setZoom(url, viewport.getZoom(url) + 0.1);
    },
    onZoomOut() {
      const url = viewport.getActiveUrl();
      if (url) viewport.setZoom(url, viewport.getZoom(url) - 0.1);
    },
    onZoomReset() {
      const url = viewport.getActiveUrl();
      if (url) viewport.setZoom(url, 1.0);
    },
    onCopyUrl() {
      const url = viewport.getNavigatedUrl();
      if (url) navigator.clipboard.writeText(url);
    },
    onLaunchTab() {
      const url = viewport.getNavigatedUrl();
      if (url) chrome.tabs.create({ url });
    },
    async onRemoveSite(index) {
      if (index < 0 || index >= config.sites.length) return;
      config.sites.splice(index, 1);
      await saveConfig(config);
      viewport.destroyAllIframes();
      wireToolbar();
      await syncDnrRules(config.sites);
      currentActive = -1;
      saveActiveSite(null);
      populateLandingSites(config.sites);
      viewport.showLanding();
    },
  });
}

init();
