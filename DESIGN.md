# Barouse — Design Document

## Overview

Barouse is a Manifest V3 Chrome extension providing a browser-owned sidebar for hosting arbitrary websites in iframes. The side panel is toggled via Chrome's extension icon. When open, it shows a 32px toolbar on the right with site buttons and a viewport on the left hosting iframe content. All source files are flat ES modules with no build step.

### What carries over from the PoC

- `chrome.sidePanel` API with `openPanelOnActionClick: true`
- Flex-row layout: viewport left, toolbar right
- Absolute-positioned iframes stacked in viewport, toggled via `display`
- Dark theme (#1e1e1e background, #2d2d2d toolbar, #0ea5e9 active accent)
- `declarativeNetRequest` for stripping X-Frame-Options and CSP

### What changes from the PoC

| PoC | Barouse |
|-----|---------|
| 2 hardcoded iframes in HTML | All iframes created lazily from config |
| Letter buttons (W, H) | Favicon `<img>` buttons with tooltips |
| Static `rules.json`, blanket stripping | Dynamic DNR rules scoped per configured domain |
| Single `sidebar.js` (13 lines) | ES modules with separated concerns |
| No config persistence | `chrome.storage.local` with JSON editor |
| No capture-tab | `chrome.tabs.query()` + `postMessage` bridge |
| `activeTab` permission | `tabs` permission (for query from sidebar context) |

---

## File Structure

```
barouse/
  manifest.json           MV3 manifest
  background.js           Service worker (sidePanel behavior)
  sidebar.html            Side panel document
  sidebar.css             All styles
  sidebar.js              Entry module: startup orchestration
  config.js               Config load/save/defaults, chrome.storage.local
  toolbar.js              Toolbar rendering and button events
  viewport.js             Iframe lifecycle and visibility
  dnr.js                  Dynamic DNR rule generation and sync
  capture.js              Tab capture and postMessage dispatch
  settings-editor.js      JSON editor UI in viewport area
  icons/
    icon16.png
    icon48.png
    icon128.png
```

---

## manifest.json

```json
{
  "manifest_version": 3,
  "name": "Barouse",
  "version": "1.0.0",
  "description": "Browser-owned sidebar hosting arbitrary sites in iframes",
  "permissions": [
    "sidePanel",
    "tabs",
    "declarativeNetRequest",
    "storage"
  ],
  "side_panel": {
    "default_path": "sidebar.html"
  },
  "action": {
    "default_title": "Toggle Barouse"
  },
  "background": {
    "service_worker": "background.js"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

Key permission choices:
- **`tabs`** instead of `activeTab` — the sidebar page needs `chrome.tabs.query()` to return `url` and `title`. `activeTab` only grants access on user-invoked action clicks, not from sidebar context. Triggers "Read your browsing history" at install.
- **`storage`** — for `chrome.storage.local` config persistence.
- **No `declarative_net_request.rule_resources`** — all rules are dynamic.

---

## Config Schema

Stored under key `"barouse_config"` in `chrome.storage.local`.

```json
{
  "sites": [
    { "url": "https://example.com", "label": "Example" }
  ]
}
```

- **Favicon** derived from URL at render time (not stored).
- **Array order** = display order (top to bottom in toolbar).
- **Duplicate URLs** rejected on save.
- **Default config** written on first run: single `example.com` entry.

Validation on save:
1. Top-level object has a `sites` array
2. Each site has `url` (http/https) and `label` (non-empty string)
3. No duplicate URLs

---

## Component Architecture

### sidebar.html — DOM skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Barouse</title>
  <link rel="stylesheet" href="sidebar.css">
</head>
<body>
  <div id="viewport">
    <div id="settings-editor" class="hidden">
      <textarea id="settings-textarea" spellcheck="false"></textarea>
      <div id="settings-controls">
        <button id="settings-save">Save</button>
        <button id="settings-cancel">Cancel</button>
      </div>
      <div id="settings-error" class="hidden"></div>
    </div>
    <!-- iframes created here dynamically -->
  </div>
  <div id="toolbar">
    <!-- buttons created dynamically -->
  </div>
  <script type="module" src="sidebar.js"></script>
</body>
</html>
```

The settings editor markup is static HTML (toggled via class), not dynamically created. Iframes and toolbar buttons are created by JS.

### toolbar.js

Renders the toolbar from config. Three types of buttons:

1. **Site buttons** — one per configured site. `<img>` favicon inside a `<button>`, tooltip shows label.
2. **Capture-tab button** — fixed position after site buttons. Posts active tab's URL+title to active iframe.
3. **Gear button** — pinned to bottom via `margin-top: auto`. Opens settings editor.

Favicon source: `https://www.google.com/s2/favicons?sz=32&domain=DOMAIN`. Fallback on `onerror`: display first letter of label (matching PoC style).

```
Exported API:
  renderToolbar(config, callbacks)   — clear and rebuild from config
  setActiveButton(index)             — update .active class (-1 for none)
```

### viewport.js

Manages iframe lifecycle. Maintains a `Map<url, HTMLIFrameElement>` of created iframes.

```
Exported API:
  showSite(url)        — show iframe for URL (lazy-create if first visit), returns iframe element
  resetSite(url)       — reset iframe to its configured URL (navigate home)
  getActiveIframe()    — returns currently visible iframe, or null
  getActiveUrl()       — returns URL key of the currently visible iframe, or null
  showSettings()       — hide active iframe, show settings editor
  hideSettings()       — hide settings editor
  destroyAllIframes()  — remove all iframes (called on config save)
```

**Lazy-create, keep-alive**: `showSite()` creates an iframe on first call for a URL, then keeps it in the DOM (hidden via `display: none`) forever. Switching sets the target iframe to `display: block` and all others to `display: none`.

**Navigate home**: `resetSite(url)` sets the iframe's `src` back to the configured URL, discarding any in-iframe navigation. This is a key feature — unlike browser tabs, the user can never get permanently lost.

### dnr.js

Generates per-domain DNR rules and syncs them atomically.

```
Exported API:
  syncDnrRules(sites)  — async, replaces all dynamic rules to match current site list
```

On each call: fetch existing dynamic rules, remove all, add one rule per unique domain. Domain extracted via `new URL(url).hostname`.

Rule structure:
```json
{
  "id": 1,
  "priority": 1,
  "action": {
    "type": "modifyHeaders",
    "responseHeaders": [
      { "header": "X-Frame-Options", "operation": "remove" },
      { "header": "Content-Security-Policy", "operation": "remove" }
    ]
  },
  "condition": {
    "requestDomains": ["example.com"],
    "resourceTypes": ["sub_frame"]
  }
}
```

### capture.js

Queries the active browser tab and posts to the active iframe.

```
Exported API:
  captureTab(targetIframe)  — async, calls chrome.tabs.query(), posts message
```

Uses `postMessage` with `targetOrigin: "*"` — acceptable because the message contains only the tab URL/title that the user explicitly chose to capture, and the sidebar is a controlled environment.

### settings-editor.js

Opens/closes the raw JSON editor in the viewport area.

```
Exported API:
  openSettingsEditor(currentConfig, onSave)  — populate textarea, show editor
  closeSettingsEditor()                       — hide editor
```

The editor is a DOM element in `#viewport` (not an iframe). Textarea pre-filled with `JSON.stringify(config, null, 2)`. Save validates, calls `onSave(parsed)`. Errors shown in `#settings-error`.

### config.js

Storage layer with defaults.

```
Exported API:
  loadConfig()           — async, returns config from storage (writes default if missing)
  saveConfig(config)     — async, writes to chrome.storage.local
  getDefaultConfig()     — returns { sites: [{ url: "https://example.com", label: "Example" }] }
  validateConfig(config) — returns { valid: boolean, error?: string }
```

---

## Data Flows

### Startup

```
sidebar.js
  → config.loadConfig()
      → chrome.storage.local.get("barouse_config")
      → if missing: write default, return default
      → if present: return stored
  → toolbar.renderToolbar(config, callbacks)
      → create favicon buttons, capture button, gear button
  → dnr.syncDnrRules(config.sites)
      → updateDynamicRules() scoped to configured domains
  → (idle, waiting for clicks)
```

### Site Switch / Navigate Home

```
User clicks site button[i]
  → onSiteClick(i)
      → if i === currentActive:
          → viewport.resetSite(sites[i].url)     // navigate home
      → else:
          → viewport.showSite(sites[i].url)
              → if first visit: create iframe, set src, append to #viewport
              → hide all other iframes (display: none)
              → show target iframe (display: block)
          → toolbar.setActiveButton(i)
          → currentActive = i
```

### Capture Tab

```
User clicks capture-tab button
  → iframe = viewport.getActiveIframe()
  → if null: no-op
  → capture.captureTab(iframe)
      → chrome.tabs.query({ active: true, currentWindow: true })
      → iframe.contentWindow.postMessage({
          type: "barouse:tab-capture",
          payload: { url, title }
        }, "*")
```

### Settings Save

```
User clicks gear
  → viewport.showSettings()
  → settingsEditor.openSettingsEditor(config, onSave)
  → toolbar.setActiveButton(-1)

User edits JSON, clicks Save
  → validate JSON
  → if invalid: show error, stop
  → config.saveConfig(newConfig)
  → settingsEditor.closeSettingsEditor()
  → viewport.destroyAllIframes()
  → toolbar.renderToolbar(newConfig, callbacks)
  → dnr.syncDnrRules(newConfig.sites)
```

---

## PostMessage Protocol

Namespace prefix: `barouse:` — prevents collision with hosted site messages.

### barouse:tab-capture

Direction: sidebar → iframe

```json
{
  "type": "barouse:tab-capture",
  "payload": {
    "url": "https://example.com/page",
    "title": "Page Title"
  }
}
```

### How hosted sites opt in

```javascript
window.addEventListener("message", (event) => {
  if (event.data?.type === "barouse:tab-capture") {
    const { url, title } = event.data.payload;
    // use captured tab info
  }
});
```

No registration or handshake required. Sites that don't listen simply ignore the messages.

### Reserved for future

- `barouse:ping` / `barouse:pong` — protocol support detection
- `barouse:navigate` — tell iframe to navigate to a URL
- `barouse:theme` — inform iframe of sidebar theme

---

## CSS Layout

### Body
```css
body {
  display: flex;
  flex-direction: row;
  height: 100vh;
  overflow: hidden;
}
```

### Viewport (#viewport)
```css
#viewport {
  flex: 1;
  position: relative;
  min-width: 0;
  overflow: hidden;
}
```
Takes all space except the 32px toolbar. Chrome's built-in panel drag handle controls overall width.

### Iframes
```css
#viewport iframe {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  border: none;
  display: none;
}
#viewport iframe.active {
  display: block;
}
```
Single `.active` class (simpler than PoC's `.visible`/`.hidden` pair).

### Toolbar (#toolbar)
```css
#toolbar {
  width: 32px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
  gap: 4px;
  background: #2d2d2d;
  border-left: 1px solid #444;
}
```

### Gear button pinned to bottom
```css
#toolbar .gear-btn {
  margin-top: auto;
}
```

### Settings editor
```css
#settings-editor {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  z-index: 5;
}
#settings-editor.hidden { display: none; }
#settings-textarea {
  flex: 1;
  background: #1a1a2e;
  color: #e0e0e0;
  border: none;
  padding: 12px;
  font-family: monospace;
  font-size: 13px;
  resize: none;
}
```

---

## Module Dependency Graph

```
sidebar.js  (entry point)
  ← config.js
  ← toolbar.js
  ← viewport.js
  ← dnr.js
  ← capture.js
  ← settings-editor.js

All other modules are leaves (no cross-imports).
Exception: settings-editor.js may import config.js for validateConfig().
```

---

## Known Limitations

**No persistent toolbar strip** — Chrome's sidePanel is all-or-nothing. When closed, the toolbar disappears entirely. The extension icon in Chrome's toolbar is the only way to reopen. This is a platform constraint, not a bug.

**JS frame-busting** — DNR strips HTTP headers (X-Frame-Options, CSP) but cannot prevent JavaScript-based frame-busting (`if (top !== self) top.location = self.location`). Some sites will break out of the iframe.

**`tabs` permission warning** — Triggers "Read your browsing history" at install. Required for `chrome.tabs.query()` to return `url` and `title` from the sidebar context. No lighter alternative exists.

**Iframe navigation drift** — After initial load, in-iframe navigation is not tracked. If the service worker restarts, iframes are recreated from configured URLs, losing any in-iframe navigation state. However, the user can always click the already-active site button to navigate home intentionally.

**Favicon service dependency** — Google's favicon service (`google.com/s2/favicons`) requires network access to Google. Falls back to first-letter display on failure.

---

## Implementation Sequence

1. `manifest.json` + `background.js` — get the panel opening
2. `config.js` — storage layer, testable from DevTools console
3. `sidebar.html` + `sidebar.css` — static shell, verify layout
4. `toolbar.js` — render buttons from config, wire click logging
5. `viewport.js` — iframe create/show/hide, wire to toolbar
6. `dnr.js` — dynamic rules, verify via chrome://extensions details
7. `sidebar.js` — orchestrate startup connecting all modules
8. `capture.js` — tab capture + postMessage, test with a listener page
9. `settings-editor.js` — JSON editor, test save-repaint-sync cycle
