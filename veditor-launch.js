// "Edit in veditor": open a GitHub file page in metabrowse's file editor.
// Pure functions only, so they can be tested outside the extension.
//
// https://<host>/<owner>/<repo>/blob/<ref...>/<path...>
//   → <metabrowse_url>#/blob/<owner>/<repo>/<ref...>/<path...>
//
// The editor talks to the GitHub host metabrowse is signed in to, not the one
// in the page URL, so the menu only appears on that host's file pages:
// metabrowse_url's own host (GHES serves Pages from it), or github.com for a
// *.github.io site.

// Returns an error string, or null if the value is usable (empty means "off").
export function validateMetabrowseUrl(value) {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string") return "metabrowse_url must be a string";
  let url;
  try { url = new URL(value); } catch { return "metabrowse_url must be a URL"; }
  if (url.protocol !== "https:") return "metabrowse_url must start with https://";
  return null;
}

export function blobHostFor(metabrowseUrl) {
  const host = new URL(metabrowseUrl).host;
  return host.endsWith(".github.io") ? "github.com" : host;
}

// For chrome.contextMenus documentUrlPatterns.
export function blobPatternFor(metabrowseUrl) {
  return `https://${blobHostFor(metabrowseUrl)}/*/*/blob/*`;
}

// The editor URL for a file page, or null if pageUrl isn't one on the right host.
export function editorUrlFor(pageUrl, metabrowseUrl) {
  let page;
  try { page = new URL(pageUrl); } catch { return null; }
  if (page.protocol !== "https:" || page.host !== blobHostFor(metabrowseUrl)) return null;
  // The path is already percent-encoded; metabrowse decodes each segment.
  // The query (?plain=1) and the anchor (#L10) are dropped.
  const m = page.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  if (!m) return null;
  const base = metabrowseUrl.split("#")[0];
  return `${base}#/blob/${m[1]}/${m[2]}/${m[3]}`;
}
