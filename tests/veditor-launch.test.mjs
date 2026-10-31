// Run: node --test (from the repo root)
// (.mjs so the deploy workflow's `git ls-files '*.js'` doesn't zip it into the extension.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMetabrowseUrl, blobHostFor, blobPatternFor, editorUrlFor } from "../veditor-launch.js";

const GHES = "https://bbgithub.example.com/pages/me/metabrowse/";
const PUBLIC = "https://stabledog.github.io/metabrowse/";

test("validateMetabrowseUrl: absent, null or empty is off, not an error", () => {
  assert.equal(validateMetabrowseUrl(undefined), null);
  assert.equal(validateMetabrowseUrl(null), null);
  assert.equal(validateMetabrowseUrl(""), null);
  assert.equal(validateMetabrowseUrl(GHES), null);
});

test("validateMetabrowseUrl: refuses non-strings, non-URLs and http", () => {
  assert.match(validateMetabrowseUrl(42), /string/);
  assert.match(validateMetabrowseUrl("metabrowse"), /URL/);
  assert.match(validateMetabrowseUrl("http://bbgithub.example.com/pages/me/metabrowse/"), /https/);
});

test("blobHostFor: GHES Pages share the host; github.io means github.com", () => {
  assert.equal(blobHostFor(GHES), "bbgithub.example.com");
  assert.equal(blobHostFor(PUBLIC), "github.com");
  assert.equal(blobPatternFor(GHES), "https://bbgithub.example.com/*/*/blob/*");
});

test("editorUrlFor: rewrites a file page, keeping ref and path segments", () => {
  assert.equal(editorUrlFor("https://bbgithub.example.com/o/r/blob/feature/x/docs/a.md", GHES),
    `${GHES}#/blob/o/r/feature/x/docs/a.md`);
  assert.equal(editorUrlFor("https://github.com/o/r/blob/main/a.md", PUBLIC), `${PUBLIC}#/blob/o/r/main/a.md`);
});

test("editorUrlFor: keeps percent-encoding, drops query and anchor", () => {
  assert.equal(editorUrlFor("https://bbgithub.example.com/o/r/blob/main/my%20file.md?plain=1#L10", GHES),
    `${GHES}#/blob/o/r/main/my%20file.md`);
});

test("editorUrlFor: replaces any hash already on metabrowse_url", () => {
  assert.equal(editorUrlFor("https://bbgithub.example.com/o/r/blob/main/a.md", `${GHES}#/teach`),
    `${GHES}#/blob/o/r/main/a.md`);
});

test("editorUrlFor: null for other hosts and non-file pages", () => {
  assert.equal(editorUrlFor("https://github.com/o/r/blob/main/a.md", GHES), null);
  assert.equal(editorUrlFor("https://bbgithub.example.com/o/r/tree/main/docs", GHES), null);
  assert.equal(editorUrlFor("https://bbgithub.example.com/o/r/blob/", GHES), null);
  assert.equal(editorUrlFor("https://bbgithub.example.com/o/r/blob/main", GHES), null); // a ref, no path
  assert.equal(editorUrlFor("https://bbgithub.example.com/o/r/blob/main/", GHES), null);
  assert.equal(editorUrlFor("not a url", GHES), null);
});
