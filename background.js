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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "barouse:ping") {
    const manifest = chrome.runtime.getManifest();
    sendResponse({ installed: true, version: manifest.version });
    return true;
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

  if (message.type === "barouse:set-favorites") {
    handleSetFavorites(message.payload, sender).then(sendResponse).catch((err) => {
      sendResponse({ status: "error", error: err.message });
    });
    return true; // async response
  }
});

// --- Favorites bar (barouse:set-favorites) ---
// Metabrowse sends a page as a folder tree; we write it to the favorites bar.
// Nodes are { title, children } (folder) or { title, url, divider? } (bookmark).
//
// Request:  { tree, replace }
// Response: { status: "created", name, linkCount }
//           { status: "exists", name }   — a same-named folder is on the bar and
//                                          replace was false; ask, then resend
//           { status: "rejected" }       — sender is not Metabrowse
//           { status: "error", error }

const FAVORITES_MAX_DEPTH = 4;
const FAVORITES_MAX_NODES = 2000;

// Only Metabrowse may write bookmarks, otherwise any web page could. The sender
// must sit under a sidebar site from the user's own config whose path contains
// /metabrowse/ — Metabrowse runs inside the sidebar, so it is always one.
async function isMetabrowseSender(sender) {
  let url;
  try { url = new URL(sender.url); } catch { return false; }
  if (url.protocol !== "https:") return false;

  const { barouse_config: cfg } = await chrome.storage.local.get("barouse_config");
  const sites = Array.isArray(cfg?.sites) ? cfg.sites : [];
  return sites.some((site) => {
    let siteUrl;
    try { siteUrl = new URL(site.url); } catch { return false; }
    if (siteUrl.origin !== url.origin) return false;
    const i = siteUrl.pathname.indexOf("/metabrowse/");
    if (i === -1) return false;
    return url.pathname.startsWith(siteUrl.pathname.slice(0, i + "/metabrowse/".length));
  });
}

// Returns an error string, or null if the tree is well-formed.
function validateFavoritesTree(tree) {
  let count = 0;
  function check(node, depth) {
    if (++count > FAVORITES_MAX_NODES) return "too many nodes";
    if (!node || typeof node.title !== "string") return "node without a title";
    if (Array.isArray(node.children)) {
      if (depth >= FAVORITES_MAX_DEPTH) return "tree too deep";
      for (const child of node.children) {
        const err = check(child, depth + 1);
        if (err) return err;
      }
      return null;
    }
    if (typeof node.url !== "string" || node.url === "") return "bookmark without a url";
    return null;
  }
  if (!Array.isArray(tree?.children) || tree.title === "") return "root must be a named folder";
  return check(tree, 0);
}

// Creates nodes in order under parentId; returns the number of non-divider bookmarks.
async function createFavoriteNodes(parentId, nodes) {
  let linkCount = 0;
  for (const node of nodes) {
    if (Array.isArray(node.children)) {
      const folder = await chrome.bookmarks.create({ parentId, title: node.title });
      linkCount += await createFavoriteNodes(folder.id, node.children);
    } else {
      await chrome.bookmarks.create({ parentId, title: node.title, url: node.url });
      if (!node.divider) linkCount++;
    }
  }
  return linkCount;
}

async function handleSetFavorites(payload, sender) {
  if (!(await isMetabrowseSender(sender))) {
    console.warn(`barouse: set-favorites rejected from ${sender.url}`);
    return { status: "rejected" };
  }

  const tree = payload?.tree;
  const invalid = validateFavoritesTree(tree);
  if (invalid) return { status: "error", error: `Invalid tree: ${invalid}` };

  // The bar is the first child of the root; its id and title vary by browser.
  const [root] = await chrome.bookmarks.getTree();
  const bar = root.children[0];

  // Only top-level folders count as a match; loose bookmarks are left alone.
  const existing = (bar.children || []).find((n) => !n.url && n.title === tree.title);
  let index; // undefined → right end of the bar
  if (existing) {
    if (!payload.replace) return { status: "exists", name: tree.title };
    index = existing.index;
    await chrome.bookmarks.removeTree(existing.id);
  }

  const folder = await chrome.bookmarks.create({ parentId: bar.id, title: tree.title, index });
  const linkCount = await createFavoriteNodes(folder.id, tree.children);
  return { status: "created", name: tree.title, linkCount };
}
