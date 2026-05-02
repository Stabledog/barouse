chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

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

  if (message.type === "barouse:open-workspace") {
    const urls = message.payload?.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      sendResponse({ error: "No URLs provided" });
      return false;
    }

    chrome.windows.create({ url: urls[0], focused: true }).then((win) => {
      const remaining = urls.slice(1);
      Promise.all(
        remaining.map((url, i) =>
          chrome.tabs.create({ windowId: win.id, url, index: i + 1 })
        )
      ).then(() => {
        sendResponse({ windowId: win.id, tabCount: urls.length });
      });
    });
    return true; // async response
  }
});
