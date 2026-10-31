// Run: node --test (from the repo root)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEditorSlot, watchSidebarRequests, sidebarRequestKey, fileNameFor } from "../editor-slot.js";

const A = "https://h/pages/me/metabrowse/#/blob/o/r/main/a.md";
const B = "https://h/pages/me/metabrowse/#/blob/o/r/main/docs/b.md";
const C = "https://h/pages/me/metabrowse/#/blob/o/r/main/c.md";

function fakeView() {
  const calls = [];
  const view = {};
  for (const name of ["load", "unload", "show", "requestQuit", "setPending", "leave"]) {
    view[name] = (...args) => calls.push(args.length ? `${name} ${args[0]}` : name);
  }
  return { view, calls };
}

test("fileNameFor: last segment of the editor path, decoded", () => {
  assert.equal(fileNameFor(B), "b.md");
  assert.equal(fileNameFor("https://h/m/#/blob/o/r/main/my%20file.md"), "my file.md");
  assert.equal(fileNameFor("https://h/m/#/blob/o/r/main/100%.md"), "100%.md");
  assert.equal(sidebarRequestKey(7), "veditor_sidebar_request:7");
});

test("open into an empty slot loads and shows the editor", () => {
  const { view, calls } = fakeView();
  const slot = createEditorSlot(view);
  slot.open(A);
  assert.deepEqual(calls, [`load ${A}`, "show"]);
  assert.equal(slot.current, A);
  assert.equal(slot.pending, null);
});

test("opening the open file again only shows it", () => {
  const { view, calls } = fakeView();
  const slot = createEditorSlot(view);
  slot.open(A);
  calls.length = 0;
  slot.open(A);
  assert.deepEqual(calls, ["show"]);
});

test("another file asks the editor to quit, and swaps in when it closes", () => {
  const { view, calls } = fakeView();
  const slot = createEditorSlot(view);
  slot.open(A);
  calls.length = 0;
  slot.open(B);
  assert.deepEqual(calls, ["show", `setPending ${B}`, "requestQuit"]);
  assert.equal(slot.current, A, "the old editor stays until it says it closed");
  calls.length = 0;
  slot.closed();
  assert.deepEqual(calls, ["unload", "setPending null", `load ${B}`, "show"]);
  assert.equal(slot.current, B);
  assert.equal(slot.pending, null);
});

test("the latest request wins, and each one asks again (an earlier confirm may have been cancelled)", () => {
  const { view, calls } = fakeView();
  const slot = createEditorSlot(view);
  slot.open(A);
  slot.open(B);
  calls.length = 0;
  slot.open(C);
  assert.deepEqual(calls, ["show", `setPending ${C}`, "requestQuit"]);
  slot.closed();
  assert.equal(slot.current, C);
});

test("reopening the current file drops the pending one", () => {
  const { view, calls } = fakeView();
  const slot = createEditorSlot(view);
  slot.open(A);
  slot.open(B);
  calls.length = 0;
  slot.open(A);
  assert.deepEqual(calls, ["show", "setPending null"]);
  assert.equal(slot.pending, null);
  calls.length = 0;
  slot.closed();
  assert.deepEqual(calls, ["unload", "leave"]);
});

test("cancelPending: a later close just empties the slot", () => {
  const { view, calls } = fakeView();
  const slot = createEditorSlot(view);
  slot.open(A);
  slot.open(B);
  slot.cancelPending();
  assert.equal(slot.pending, null);
  calls.length = 0;
  slot.closed();
  assert.deepEqual(calls, ["unload", "leave"]);
  assert.equal(slot.current, null);
});

test("loaded: asks again only while a swap is waiting", () => {
  const { view, calls } = fakeView();
  const slot = createEditorSlot(view);
  slot.open(A);
  calls.length = 0;
  slot.loaded();
  assert.deepEqual(calls, []);
  slot.open(B);
  calls.length = 0;
  slot.loaded();
  assert.deepEqual(calls, ["requestQuit"]);
});

test("closed with an empty slot does nothing", () => {
  const { view, calls } = fakeView();
  const slot = createEditorSlot(view);
  slot.closed();
  slot.cancelPending();
  assert.deepEqual(calls, []);
});

function fakeStorage(initial = {}) {
  const data = { ...initial };
  const listeners = [];
  return {
    data,
    storage: {
      get: async (key) => (key in data ? { [key]: data[key] } : {}),
      remove: async (key) => { delete data[key]; },
    },
    onChanged: { addListener: (fn) => listeners.push(fn) },
    fire: (changes, area = "session") => listeners.forEach((fn) => fn(changes, area)),
  };
}

test("watchSidebarRequests: takes a request waiting at startup, then removes it", async () => {
  const key = sidebarRequestKey(3);
  const s = fakeStorage({ [key]: { fileUrl: "https://h/o/r/blob/main/a.md", id: "1" } });
  const got = [];
  await watchSidebarRequests({ ...s, windowId: 3, onRequest: (u) => got.push(u) });
  assert.deepEqual(got, ["https://h/o/r/blob/main/a.md"]);
  assert.equal(key in s.data, false);
});

test("watchSidebarRequests: takes later requests for this window only, once each", async () => {
  const s = fakeStorage();
  const got = [];
  await watchSidebarRequests({ ...s, windowId: 3, onRequest: (u) => got.push(u) });
  assert.deepEqual(got, []);
  const req = { fileUrl: "https://h/o/r/blob/main/a.md", id: "1" };
  s.fire({ [sidebarRequestKey(3)]: { newValue: req } });
  s.fire({ [sidebarRequestKey(3)]: { newValue: req } }); // same id again
  s.fire({ [sidebarRequestKey(4)]: { newValue: { fileUrl: "other window", id: "2" } } });
  s.fire({ [sidebarRequestKey(3)]: { newValue: { fileUrl: "local area", id: "3" } } }, "local");
  s.fire({ [sidebarRequestKey(3)]: { oldValue: req } }); // the removal
  s.fire({ [sidebarRequestKey(3)]: { newValue: { ...req, id: "4" } } }); // same file, new click
  assert.deepEqual(got, [req.fileUrl, req.fileUrl]);
});

test("watchSidebarRequests: ignores malformed requests", async () => {
  const key = sidebarRequestKey(3);
  const s = fakeStorage({ [key]: { id: "1" } });
  const got = [];
  await watchSidebarRequests({ ...s, windowId: 3, onRequest: (u) => got.push(u) });
  s.fire({ [key]: { newValue: "https://h/o/r/blob/main/a.md" } });
  assert.deepEqual(got, []);
});
