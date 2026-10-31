// "Edit in veditor" → Sidebar: one editor slot in the side panel.
// No chrome.* or DOM here, so it can be tested outside the extension.
//
// Protocol (the other half is metabrowse's src/file-editor.ts):
//   background → sidebar   chrome.storage.session[sidebarRequestKey(windowId)]
//                          = { fileUrl, id }, written in the menu click right
//                          before chrome.sidePanel.open(). The sidebar takes it
//                          (reads, then removes it) at startup and on
//                          storage.onChanged, so it works whether the panel was
//                          already open or is just opening.
//   sidebar → editor       postMessage { type: "barouse:request-quit" }. The
//                          editor quits as if the user typed :q, so a dirty
//                          buffer gets veditor's own confirm bar.
//   editor → sidebar       postMessage { type: "barouse:editor-closed" } once
//                          it has quit, and { type: "barouse:editor-dirty",
//                          dirty } whenever the buffer starts or stops
//                          differing from the last commit (the slot button
//                          turns red; a new or reloaded editor starts clean).
//                          Each side checks event.source: the sidebar against
//                          the editor iframe, the editor against window.parent.
//
// There's no close button: the editor closes with :q or a request-quit. If the
// user cancels the confirm bar, no editor-closed comes and the next file waits
// until they quit or cancel it.

const REQUEST_PREFIX = "veditor_sidebar_request:";

// The side panel is per window, so each window has its own request key.
export function sidebarRequestKey(windowId) {
  return `${REQUEST_PREFIX}${windowId}`;
}

// The file name shown on the slot button, from an editor URL (…#/blob/o/r/ref…/path…).
export function fileNameFor(editorUrl) {
  const last = editorUrl.split("#")[1]?.split("/").pop() || "";
  try { return decodeURIComponent(last); } catch { return last; }
}

// view: what the slot does to the page.
//   load(url)        create the editor iframe
//   unload()         remove it
//   show()           bring the editor to the front
//   requestQuit()    post barouse:request-quit to the editor
//   setPending(url)  show (or, with null, hide) "url opens when you quit"
//   leave()          the slot is empty: drop its button, return to the previous view
export function createEditorSlot(view) {
  let current = null; // editor URL loaded in the iframe
  let pending = null; // editor URL to open once current closes

  function setPending(url) {
    pending = url;
    view.setPending(url);
  }

  return {
    get current() { return current; },
    get pending() { return pending; },

    open(url) {
      if (!current) {
        current = url;
        view.load(url);
        view.show();
        return;
      }
      view.show();
      if (url === current) {
        if (pending) setPending(null);
        return;
      }
      // Ask again every time: the user may have cancelled an earlier confirm bar.
      setPending(url);
      view.requestQuit();
    },

    // The editor sent barouse:editor-closed (the caller checked event.source).
    closed() {
      if (!current) return;
      view.unload();
      current = null;
      if (pending) {
        const next = pending;
        setPending(null);
        current = next;
        view.load(next);
        view.show();
      } else {
        view.leave();
      }
    },

    // The editor iframe finished loading. A request-quit posted before then
    // went nowhere (metabrowse wasn't listening yet), so ask again.
    loaded() {
      if (pending) view.requestQuit();
    },

    cancelPending() {
      if (pending) setPending(null);
    },
  };
}

// Calls onRequest(fileUrl) for each request the background writes for this
// window, including one already waiting at startup. A request is removed once
// taken, so reopening the panel later doesn't reopen the file.
// storage: chrome.storage.session; onChanged: chrome.storage.onChanged.
export function watchSidebarRequests({ storage, onChanged, windowId, onRequest }) {
  const key = sidebarRequestKey(windowId);
  let lastId = null;

  function take(request) {
    if (!request || typeof request.fileUrl !== "string" || request.id === lastId) return;
    lastId = request.id;
    storage.remove(key).catch(() => {});
    onRequest(request.fileUrl);
  }

  onChanged.addListener((changes, area) => {
    if (area === "session" && changes[key]?.newValue) take(changes[key].newValue);
  });
  return storage.get(key).then((data) => take(data[key]));
}
