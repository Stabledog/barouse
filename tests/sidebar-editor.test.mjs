// Run: node --test (from the repo root; needs `npm install` for jsdom)
// The sidebar's editor slot under jsdom: the real sidebar.html and sidebar.js,
// a fake chrome.*, and the editor iframe's messages played by hand. jsdom
// doesn't load the iframe's src, so each editor iframe is an empty window
// that stands in for metabrowse's file editor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { makeChrome, settle } from "./chrome-stub.mjs";

const METABROWSE = "https://bbgithub.example.com/pages/me/metabrowse/";
const SITES = [
  { url: "https://one.example.com/", label: "One" },
  { url: "https://two.example.com/", label: "Two" },
];
const fileUrl = (path) => `https://bbgithub.example.com/o/r/blob/main/${path}`;
const editorUrl = (path) => `${METABROWSE}#/blob/o/r/main/${path}`;

const html = readFileSync(new URL("../sidebar.html", import.meta.url), "utf8")
  .replace(/<script[^>]*><\/script>/g, "");
// jsdom has no window.focus(); the sidebar calls it when showing a frame.
const virtualConsole = new VirtualConsole().on("jsdomError", (err) => {
  if (!/Not implemented: window\.focus/.test(err.message)) console.error(err);
});
const dom = new JSDOM(html, { url: "chrome-extension://test/sidebar.html", virtualConsole });
const { window } = dom;
const { document } = window;
globalThis.window = window;
globalThis.document = document;

const WINDOW_ID = 7;
const KEY = `veditor_sidebar_request:${WINDOW_ID}`;
const fake = makeChrome({
  windowId: WINDOW_ID,
  local: {
    barouse_config: { sites: SITES, metabrowse_url: METABROWSE },
    barouse_active_site: SITES[0].url,
  },
  session: {
    podifill_setup_done: true,
    // Written by the menu click that opened the panel.
    [KEY]: { fileUrl: fileUrl("a.md"), id: "startup" },
  },
});
globalThis.chrome = fake.chrome;

await import("../sidebar.js");
for (let i = 0; i < 5; i++) await settle(); // init()

const $ = (sel) => document.querySelector(sel);
const pane = () => $("#editor-pane");
const editorFrames = () => [...pane().querySelectorAll("iframe")];
const siteFrame = (i) => [...$("#viewport").children].find((el) => el.tagName === "IFRAME" && el.src === SITES[i].url);
const editorBtn = () => $("#toolbar .editor-btn");
const pendingBanner = () => $("#editor-pending");
let nextId = 0;

async function request(path) {
  await chrome.storage.session.set({ [KEY]: { fileUrl: fileUrl(path), id: `r${nextId++}` } });
  await settle();
}

function fromEditor(source, type = "barouse:editor-closed") {
  window.dispatchEvent(new window.MessageEvent("message", { data: { type }, source }));
}

// Messages the sidebar posts into an editor iframe.
function inbox(iframe) {
  const got = [];
  iframe.contentWindow.addEventListener("message", (e) => got.push(e.data?.type));
  return got;
}

test("a request waiting at startup opens the editor over the restored site, and is used up", () => {
  const [iframe] = editorFrames();
  assert.equal(editorFrames().length, 1);
  assert.equal(iframe.src, editorUrl("a.md"));
  assert.equal(pane().classList.contains("hidden"), false);
  assert.equal(siteFrame(0).classList.contains("active"), false, "the restored site is behind the editor");
  assert.equal(editorBtn().classList.contains("active"), true);
  assert.equal(editorBtn().dataset.tooltip, "veditor: a.md");
  assert.equal(KEY in fake.chrome.storage.session.data, false);
});

test("the editor iframe gets the same sandbox and clipboard access as sites", () => {
  const [iframe] = editorFrames();
  assert.equal(iframe.getAttribute("sandbox"), siteFrame(0).getAttribute("sandbox"));
  assert.equal(iframe.allow, siteFrame(0).allow);
});

test("switching to a site hides the editor but keeps it; the slot button brings it back", () => {
  const [iframe] = editorFrames();
  $("#toolbar button[data-index='1']").click();
  assert.equal(pane().classList.contains("hidden"), true);
  assert.equal(siteFrame(1).classList.contains("active"), true);
  assert.equal(editorBtn().classList.contains("active"), false);
  editorBtn().click();
  assert.equal(pane().classList.contains("hidden"), false);
  assert.equal(siteFrame(1).classList.contains("active"), false);
  assert.equal(editorBtn().classList.contains("active"), true);
  assert.equal(editorFrames()[0], iframe, "same editor, not reloaded");
});

test("opening the same file again just shows it", async () => {
  const [iframe] = editorFrames();
  const got = inbox(iframe);
  $(".home-btn").click();
  await request("a.md");
  assert.equal(pane().classList.contains("hidden"), false);
  assert.deepEqual(editorFrames(), [iframe]);
  assert.deepEqual(got, []);
});

test("editor-closed from anything but the editor iframe is ignored", () => {
  fromEditor(window);
  fromEditor(siteFrame(0).contentWindow);
  assert.equal(editorFrames().length, 1);
});

test("another file: request-quit to the editor, a banner, and a swap once it closes", async () => {
  const [old] = editorFrames();
  const got = inbox(old);
  await request("docs/b.md");
  assert.deepEqual(got, ["barouse:request-quit"]);
  assert.equal(pendingBanner().classList.contains("hidden"), false);
  assert.match($("#editor-pending-text").textContent, /^b\.md opens when you quit/);
  assert.deepEqual(editorFrames(), [old], "the old editor stays until it says it closed");

  fromEditor(old.contentWindow);
  const [now] = editorFrames();
  assert.equal(editorFrames().length, 1);
  assert.equal(now.src, editorUrl("docs/b.md"));
  assert.equal(old.isConnected, false);
  assert.equal(pendingBanner().classList.contains("hidden"), true);
  assert.equal(editorBtn().dataset.tooltip, "veditor: b.md");
  assert.equal($("#toolbar").querySelectorAll(".editor-btn").length, 1);
});

test("a request-quit sent while the editor was still loading is sent again on load", async () => {
  const [cur] = editorFrames();
  const got = inbox(cur);
  await request("c.md");
  cur.dispatchEvent(new window.Event("load"));
  await settle();
  assert.deepEqual(got, ["barouse:request-quit", "barouse:init", "barouse:request-quit"]);
  $("#editor-pending-cancel").click();
  cur.dispatchEvent(new window.Event("load"));
  await settle();
  assert.equal(got.length, 4, "no swap waiting: only barouse:init");
});

test("other messages from the editor don't close it", () => {
  const [now] = editorFrames();
  fromEditor(now.contentWindow, "barouse:url-update");
  assert.deepEqual(editorFrames(), [now]);
});

test("Don't open cancels the swap: the editor stays, and its later close empties the slot", async () => {
  const [cur] = editorFrames();
  await request("c.md");
  $("#editor-pending-cancel").click();
  assert.equal(pendingBanner().classList.contains("hidden"), true);
  fromEditor(cur.contentWindow);
  assert.deepEqual(editorFrames(), []);
  assert.equal(editorBtn(), null);
});

test("closing returns to the site that was showing when the editor came up", async () => {
  $("#toolbar button[data-index='1']").click();
  await request("a.md");
  assert.equal(siteFrame(1).classList.contains("active"), false);
  fromEditor(editorFrames()[0].contentWindow);
  assert.equal(pane().classList.contains("hidden"), true);
  assert.equal(siteFrame(1).classList.contains("active"), true);
  assert.equal(editorBtn(), null);
});

test("closing while the user is on a site leaves them there", async () => {
  await request("a.md");
  $("#toolbar button[data-index='0']").click();
  fromEditor(editorFrames()[0].contentWindow);
  assert.equal(siteFrame(0).classList.contains("active"), true);
  assert.equal(editorBtn(), null);
});

test("from the landing page, closing returns to the landing page", async () => {
  $(".home-btn").click();
  await request("a.md");
  fromEditor(editorFrames()[0].contentWindow);
  assert.equal($("#landing-page").classList.contains("hidden"), false);
});

test("requests for other windows, and for pages on another host, open nothing", async () => {
  await chrome.storage.session.set({ "veditor_sidebar_request:8": { fileUrl: fileUrl("a.md"), id: "w8" } });
  await settle();
  assert.deepEqual(editorFrames(), []);
  // A page from another host: editorUrlFor refuses it.
  await chrome.storage.session.set({ [KEY]: { fileUrl: "https://github.com/o/r/blob/main/a.md", id: "gh" } });
  await settle();
  assert.deepEqual(editorFrames(), []);
});

test("a config save rebuilds the toolbar but keeps the editor and its button", async () => {
  await request("a.md");
  const [iframe] = editorFrames();
  $(".gear-btn").click();
  $("#settings-save").click();
  for (let i = 0; i < 5; i++) await settle();
  assert.deepEqual(editorFrames(), [iframe]);
  assert.equal($("#toolbar").querySelectorAll(".editor-btn").length, 1);
  assert.equal($("#landing-page").classList.contains("hidden"), false);
  editorBtn().click();
  assert.equal(pane().classList.contains("hidden"), false);
});
