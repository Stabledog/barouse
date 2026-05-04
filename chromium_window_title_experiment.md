# Task: Investigate Whether a Chromium Extension Can Set the Browser Window Title

## Goal

Experiment with a Chromium browser extension to determine whether it can set or influence the **actual browser window title**, not merely the page/tab title.

The key question:

> Can a Chromium extension set the OS/browser window title independently of `document.title`?

## Background

Changing `document.title` affects the tab title and may influence what appears in the browser window frame, but that is not the same as directly setting the browser window title.

Chromium extension APIs such as `chrome.windows`, `chrome.tabs`, and `chrome.scripting` do not expose a direct API like:

    chrome.windows.setTitle(...)

This experiment should verify whether any supported or practical workaround exists.

## Constraints

- Target Chromium / Google Chrome extension APIs.
- Prefer Manifest V3.
- Do not rely on native messaging unless explicitly called out.
- Distinguish clearly between:
  - tab title
  - page `document.title`
  - browser window title / OS window frame title
  - extension UI elements

## Questions to Answer

1. Is there any official API to directly set the browser window title?
2. Can `chrome.windows.update()` affect it?
3. Can `chrome.tabs.update()` affect it?
4. How does `document.title` propagate to the window title?
5. Are there differences across window types (normal, popup, PWA)?
6. Are there browser differences (Chrome vs Edge/Brave)?
7. Are there workarounds?

## Suggested Experiment

Create a minimal MV3 extension with:
- manifest.json
- background service worker
- content script or injected script

### Minimal Manifest

    {
      "manifest_version": 3,
      "name": "Window Title Experiment",
      "version": "0.1.0",
      "permissions": ["tabs", "windows", "scripting", "activeTab"],
      "host_permissions": ["<all_urls>"],
      "background": {
        "service_worker": "background.js"
      }
    }

## Experiments

### 1. API Exploration

Inspect:
- chrome.windows
- chrome.tabs

Confirm no API exists for setting window title.

### 2. windows.update

    chrome.windows.update(windowId, {
      focused: true
    });

Verify no title field exists.

### 3. tabs.update

Confirm no ability to set title via tab APIs.

### 4. Modify document.title

    document.title = "[TEST] " + document.title;

Observe:
- tab label
- window frame title
- OS-level window label

### 5. Prevent Overrides

    const prefix = "[TEST] ";

    function apply() {
      if (!document.title.startsWith(prefix)) {
        document.title = prefix + document.title;
      }
    }

    apply();

    const el = document.querySelector("title") || document.head.appendChild(document.createElement("title"));

    new MutationObserver(apply).observe(el, {
      childList: true,
      subtree: true,
      characterData: true
    });

### 6. Popup Windows

    chrome.windows.create({
      url: "https://example.com",
      type: "popup",
      width: 800,
      height: 600
    });

Check if title follows document.title.

### 7. Extension Page

Create test.html with:

    <title>Initial Title</title>

Then:

    document.title = "Updated Title";

Observe window title behavior.

## Expected Outcome

- No direct API exists to set the browser window title.
- Window title is derived from active tab title.
- document.title is the only practical influence point.
- No independent per-window title control is available via extensions.

## Stretch Goal

Investigate native messaging as a way to control OS-level window titles outside Chromium APIs.
