// A minimal fake of the chrome.* APIs barouse's pages touch at load time.
// Every call is recorded in `calls` as [name, ...args]; events keep their
// listeners in `listeners[name]` so tests can fire them.

function fakeArea(name, calls, fire, initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      if (key == null) return { ...data };
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
    },
    async set(items) {
      calls.push([`storage.${name}.set`, items]);
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data[k], newValue: v };
        data[k] = v;
      }
      fire("storage.onChanged", changes, name);
    },
    async remove(key) {
      calls.push([`storage.${name}.remove`, key]);
      const changes = {};
      for (const k of Array.isArray(key) ? key : [key]) {
        if (!(k in data)) continue;
        changes[k] = { oldValue: data[k] };
        delete data[k];
      }
      if (Object.keys(changes).length) fire("storage.onChanged", changes, name);
    },
  };
}

export function makeChrome({ local = {}, session = {}, sync = {}, windowId = 1 } = {}) {
  const calls = [];
  const listeners = {};
  const fire = (name, ...args) => (listeners[name] || []).forEach((fn) => fn(...args));
  const event = (name) => ({ addListener: (fn) => (listeners[name] ||= []).push(fn) });
  const record = (name, result) => (...args) => {
    calls.push([name, ...args]);
    return typeof result === "function" ? result(...args) : Promise.resolve(result);
  };

  const chrome = {
    runtime: {
      lastError: undefined,
      getManifest: () => ({ version: "0.0.0-test" }),
      getURL: (p) => `chrome-extension://test/${p}`,
      sendMessage: record("runtime.sendMessage"),
      onMessage: event("runtime.onMessage"),
      onInstalled: event("runtime.onInstalled"),
      onStartup: event("runtime.onStartup"),
    },
    storage: {
      local: fakeArea("local", calls, fire, local),
      session: fakeArea("session", calls, fire, session),
      sync: fakeArea("sync", calls, fire, sync),
      onChanged: event("storage.onChanged"),
    },
    sidePanel: {
      setPanelBehavior: record("sidePanel.setPanelBehavior"),
      open: record("sidePanel.open"),
    },
    contextMenus: {
      create: (props, cb) => { calls.push(["contextMenus.create", props]); cb?.(); },
      removeAll: record("contextMenus.removeAll"),
      onClicked: event("contextMenus.onClicked"),
    },
    windows: {
      WINDOW_ID_NONE: -1,
      getCurrent: record("windows.getCurrent", { id: windowId }),
      getLastFocused: record("windows.getLastFocused", { id: windowId }),
      create: record("windows.create", { id: 99 }),
      onRemoved: event("windows.onRemoved"),
    },
    tabs: {
      create: record("tabs.create", {}),
      query: record("tabs.query", []),
      onActivated: event("tabs.onActivated"),
      onUpdated: event("tabs.onUpdated"),
    },
    scripting: { executeScript: record("scripting.executeScript") },
    webRequest: { onCompleted: event("webRequest.onCompleted") },
    declarativeNetRequest: {
      getDynamicRules: record("declarativeNetRequest.getDynamicRules", []),
      updateDynamicRules: record("declarativeNetRequest.updateDynamicRules"),
    },
    bookmarks: {},
  };
  return { chrome, calls, listeners, fire };
}

// Lets pending promise callbacks (and zero-delay timers) run.
export function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
