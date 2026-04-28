# Barouse — Browser-Owned Sidebar Extension

## Problem

Browser vendors control sidebar features and can remove them at will (Edge removed theirs; Vivaldi's has quirks like no drag-and-drop from the address bar). We need a self-owned sidebar that works across all Chromium browsers, hosting our apps (metabrowse, notehub) as well as existing favorite sites, and providing capabilities that browser sidebars lack.

## Validated in PoC (../sidebar-ext/)

- `chrome.sidePanel` API provides a persistent sidebar panel
- Two iframes with visibility toggling preserves state across site switches
- `declarativeNetRequest` header stripping allows any site to be iframed
- Links with explicit `target` attributes escape the iframe to the main browser naturally

## Requirements

### Core Sidebar Shell

- [ ] Vertical toolbar on the right edge with icon buttons for each hosted site
- [ ] Iframe-based site hosting with state preservation when switching
- [ ] Header stripping so any site can be loaded (not just our own)
- [ ] Configurable site list (URLs, labels, icons) — not hardcoded
    - Retrieve favicon for the hosted site to replace default new-site button on first load
    - User can add/remove sites

### chrome.tabs Bridge

- [ ] Extension bridge between sidebar iframes and Chrome extension APIs
- [ ] "Capture tab" action: sidebar JS reads active tab's URL + title via `chrome.tabs.query()`, posts into the active iframe via `postMessage`
- [ ] Hosted apps (metabrowse, notehub) can request tab info without clipboard or drag-and-drop

### Panel Visibility

- The side panel is toggled open/closed via Chrome's extension icon (or keyboard shortcut)
- When closed, the panel is fully hidden and the browser content reclaims all horizontal space
- When open, the panel shows the toolbar + viewport; Chrome's built-in drag handle controls panel width
- No persistent toolbar strip when closed — this is a Chrome sidePanel API constraint

### Toolbar Behavior

- Favicon buttons with text tooltips showing page title
- Clicking a site button switches the viewport to that site's iframe
- Clicking the **already-active** site button resets its iframe back to the configured URL (navigate home)
    - This is a key differentiator: unlike browser tabs, you can never get permanently lost — one click returns to the starting point
- Dedicated "capture tab" button in the toolbar (reads active browser tab URL + title, posts to active iframe)
- Gear icon at the bottom of the toolbar opens the settings editor in the viewport area

### Iframe Lifecycle

- **Lazy-create, keep-alive**: iframes are created on first click, then kept alive (hidden via `display:none`) for state preservation
- First click on a new site has a load delay; subsequent switches are instant
- No eviction — all visited sites stay in memory for the session

### Header Stripping

- **Scoped to configured URLs only** — DNR rules use `requestDomains` conditions matching the site list
- Rules regenerated dynamically via `chrome.declarativeNetRequest.updateDynamicRules()` when site list changes
- Avoids blanket weakening of X-Frame-Options/CSP across all browsing

### Site Configuration

- Stored in `chrome.storage.local`
- Editable via a settings page that opens in the viewport (gear icon at bottom of toolbar)
- Raw JSON editor for v1 — user edits the config directly
- Saving updates the toolbar buttons immediately (repaint)
- Ships pre-configured with `example.com` as a starter so the user sees what to expect
- No cross-device sync for now

### PostMessage Protocol

- Generic/open protocol — any hosted site can adopt it, not restricted to metabrowse/notehub
- Primary use case: "capture tab" delivers `{ url, title }` of the active browser tab to the active iframe

### Deferred

- Remembering last-active site across browser restarts
- Cross-device sync via `chrome.storage.sync`
- Keyboard shortcuts for site switching
