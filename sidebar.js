import { loadConfig, saveConfig } from "./config.js";
import { renderToolbar, setActiveButton } from "./toolbar.js";
import * as viewport from "./viewport.js";
import { syncDnrRules } from "./dnr.js";
import { captureTab } from "./capture.js";
import { openSettingsEditor, closeSettingsEditor } from "./settings-editor.js";
import { initContextMenu } from "./context-menu.js";

let config = null;
let currentActive = -1;

// --- Add Site Dialog ---

const addSiteDialog = document.getElementById("add-site-dialog");
const addSiteUrlEl = document.getElementById("add-site-url");
const addSiteLabelInput = document.getElementById("add-site-label");
const addSiteSaveBtn = document.getElementById("add-site-save");
const addSiteCancelBtn = document.getElementById("add-site-cancel");

function showAddSiteDialog(tab) {
  addSiteUrlEl.textContent = tab.url;
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
});

addSiteCancelBtn.addEventListener("click", hideAddSiteDialog);

function wireToolbar() {
  renderToolbar(config, {
    onSiteClick(i) {
      const site = config.sites[i];
      if (i === currentActive) {
        if (viewport.isErrored(site.url)) {
          // Retry loading after error
          viewport.retrySite(site.url);
        } else {
          // Already active — navigate home
          viewport.resetSite(site.url);
        }
      } else {
        // Switch to this site
        viewport.showSite(site.url);
        setActiveButton(i);
        currentActive = i;
      }
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
      }, () => {
        // Cancel — return to previously active site or just hide editor
        closeSettingsEditor();
        viewport.hideSettings();
      });
    }
  });
}

async function init() {
  config = await loadConfig();
  wireToolbar();
  await syncDnrRules(config.sites);
  initContextMenu(() => viewport.getActiveUrl());
}

init();
