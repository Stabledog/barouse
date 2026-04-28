# Barouse — Browser-Owned Sidebar Extension

## Problem

Browser vendors control sidebar features and can remove them at will (Edge removed theirs; Vivaldi's has quirks like no drag-and-drop from the address bar). We need a self-owned sidebar that works across all Chromium browsers, hosting our apps (metabrowse, notehub) and providing capabilities that browser sidebars lack.

## Validated in PoC (sidebar-ext/)

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

### chrome.tabs Bridge

- [ ] Extension bridge between sidebar iframes and Chrome extension APIs
- [ ] "Capture tab" action: sidebar JS reads active tab's URL + title via `chrome.tabs.query()`, posts into the active iframe via `postMessage`
- [ ] Hosted apps (metabrowse, notehub) can request tab info without clipboard or drag-and-drop

### Open Questions

- Toolbar icon style: text labels, favicons from hosted sites, or custom SVG icons?
- Should the site list be editable at runtime (settings page) or just a config file in the extension?
- Should the sidebar remember which site was last active across browser restarts?
- Should the toolbar support reordering or adding/removing sites?
- Any keyboard shortcuts for switching between sites or toggling the sidebar?
- Should the extension sync settings across devices via `chrome.storage.sync`?
