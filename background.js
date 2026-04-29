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
