import { loadConfig, saveConfig } from "./config.js";
import { renderToolbar, setActiveButton } from "./toolbar.js";
import * as viewport from "./viewport.js";
import { syncDnrRules } from "./dnr.js";
import { captureTab } from "./capture.js";
import { openSettingsEditor, closeSettingsEditor } from "./settings-editor.js";

let config = null;
let currentActive = -1;

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

    onCaptureClick() {
      const iframe = viewport.getActiveIframe();
      captureTab(iframe);
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
}

init();
