chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// --- Workspace window title ---
// Maps windowId → workspaceName in memory for synchronous lookup (no async
// race with onUpdated). Backed by chrome.storage.session so the mapping
// survives service-worker restarts.

const _wsWindows = {};

chrome.storage.session.get("workspaceWindows").then((data) => {
  Object.assign(_wsWindows, data.workspaceWindows || {});
});

function _wsFlush() {
  chrome.storage.session.set({ workspaceWindows: { ..._wsWindows } });
}

function injectWorkspaceTitle(tabId, name) {
  chrome.scripting.executeScript({
    target: { tabId },
    args: [name],
    func: (wsName) => {
      const prefix = `${wsName} — `;

      function apply() {
        const bare = document.title.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
        document.title = prefix + bare;
      }

      apply();

      const el = document.querySelector("title")
        || document.head.appendChild(document.createElement("title"));

      new MutationObserver(apply).observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
  }).catch((err) => {
    console.warn(`barouse: title inject failed for tab ${tabId}:`, err.message);
  });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  const name = _wsWindows[activeInfo.windowId];
  if (name) {
    injectWorkspaceTitle(activeInfo.tabId, name);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const name = _wsWindows[tab.windowId];
  if (name) {
    injectWorkspaceTitle(tabId, name);
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (_wsWindows[windowId]) {
    delete _wsWindows[windowId];
    _wsFlush();
  }
});

// Detect HTTP errors (4xx/5xx) on sub_frame requests and notify the sidebar.
// This catches sites like Google Drive that return 403 when loaded in an iframe
// (server-side Sec-Fetch-Dest check that extensions cannot bypass).
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode >= 400) {
      chrome.runtime.sendMessage({
        type: "iframe-http-error",
        url: details.url,
        statusCode: details.statusCode
      }).catch(() => {
        // Sidebar not open — ignore
      });
    }
  },
  { urls: ["<all_urls>"], types: ["sub_frame"] }
);

// Workspace API: handle messages relayed from nav-helper.js content script.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "barouse:ping") {
    const manifest = chrome.runtime.getManifest();
    sendResponse({ installed: true, version: manifest.version });
    return false;
  }

  if (message.type === "barouse:query-tabs") {
    const queryOpts = message.payload?.windowId
      ? { windowId: message.payload.windowId }
      : { currentWindow: true };
    chrome.tabs.query(queryOpts).then((tabs) => {
      sendResponse(tabs.map((t) => ({
        url: t.url,
        title: t.title,
        index: t.index,
        pinned: t.pinned,
      })));
    }).catch(() => {
      sendResponse([]);
    });
    return true; // async response
  }

  if (message.type === "barouse:switch-tab") {
    chrome.runtime.sendMessage(message).catch(() => {});
    return false;
  }

  if (message.type === "barouse:open-workspace") {
    const urls = message.payload?.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      sendResponse({ error: "No URLs provided" });
      return false;
    }

    const workspaceName = message.payload?.name || null;

    chrome.windows.create({ url: urls[0], focused: true }).then(async (win) => {
      if (workspaceName) {
        _wsWindows[win.id] = workspaceName;
        _wsFlush();
      }

      const remaining = urls.slice(1);
      await Promise.all(
        remaining.map((url, i) =>
          chrome.tabs.create({ windowId: win.id, url, index: i + 1 })
        )
      );

      sendResponse({ windowId: win.id, tabCount: urls.length });
    });
    return true; // async response
  }
});
