// Run: node --test (from the repo root)
// The "Edit in veditor" menu clicks in background.js, against a fake chrome.*.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeChrome, settle } from "./chrome-stub.mjs";

const METABROWSE = "https://bbgithub.example.com/pages/me/metabrowse/";
const FILE = "https://bbgithub.example.com/o/r/blob/main/docs/a.md";

const fake = makeChrome({ local: { barouse_config: { sites: [], metabrowse_url: METABROWSE } } });
globalThis.chrome = fake.chrome;
await import("../background.js");
const click = (info, tab) => fake.listeners["contextMenus.onClicked"][0](info, tab);

test("menus: Window and Sidebar under Edit in veditor, on file pages only", async () => {
  fake.fire("runtime.onInstalled");
  await settle();
  const menus = fake.calls.filter(([n]) => n === "contextMenus.create").map(([, p]) => p);
  assert.deepEqual(menus.map((m) => [m.id, m.parentId, m.title]), [
    ["veditor-edit", undefined, "Edit in veditor"],
    ["veditor-edit-window", "veditor-edit", "Window"],
    ["veditor-edit-sidebar", "veditor-edit", "Sidebar"],
  ]);
  for (const m of menus) assert.deepEqual(m.documentUrlPatterns, ["https://bbgithub.example.com/*/*/blob/*"]);
});

test("Sidebar: writes the request and opens the panel before the handler returns (user gesture)", () => {
  fake.calls.length = 0;
  click({ menuItemId: "veditor-edit-sidebar", pageUrl: FILE }, { id: 10, windowId: 5 });
  // Nothing awaited yet: both calls must already have been made.
  const [set, open] = fake.calls;
  assert.equal(set[0], "storage.session.set");
  const request = set[1]["veditor_sidebar_request:5"];
  assert.equal(request.fileUrl, FILE);
  assert.equal(typeof request.id, "string");
  assert.deepEqual(open, ["sidePanel.open", { windowId: 5 }]);
});

test("Sidebar: a new click on the same file is a new request", () => {
  fake.calls.length = 0;
  click({ menuItemId: "veditor-edit-sidebar", pageUrl: FILE }, { id: 10, windowId: 5 });
  const first = fake.calls[0][1]["veditor_sidebar_request:5"].id;
  click({ menuItemId: "veditor-edit-sidebar", pageUrl: FILE }, { id: 10, windowId: 5 });
  const second = fake.calls[2][1]["veditor_sidebar_request:5"].id;
  assert.notEqual(first, second);
});

test("Sidebar: a page framed in the panel (frameUrl, no tab) goes to the focused window's panel", async () => {
  fake.calls.length = 0;
  click({ menuItemId: "veditor-edit-sidebar", pageUrl: "chrome-extension://x/sidebar.html", frameUrl: FILE }, undefined);
  await settle();
  const names = fake.calls.map(([n]) => n);
  assert.deepEqual(names, ["windows.getLastFocused", "storage.session.set"]);
  assert.equal(fake.calls[1][1]["veditor_sidebar_request:1"].fileUrl, FILE);
});

test("Window: still opens a popup on the editor URL", async () => {
  fake.calls.length = 0;
  click({ menuItemId: "veditor-edit-window", pageUrl: FILE }, { id: 10, windowId: 5 });
  await settle();
  const create = fake.calls.find(([n]) => n === "windows.create");
  assert.equal(create[1].url, `${METABROWSE}#/blob/o/r/main/docs/a.md`);
  assert.equal(create[1].type, "popup");
  assert.equal(fake.calls.some(([n]) => n === "sidePanel.open"), false);
});
