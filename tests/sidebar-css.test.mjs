// Run: node --test (from the repo root; needs `npm install` for jsdom)
// Stacking in sidebar.css. jsdom does no layout, so this reads the rules: the
// toolbar's tooltips (::after) stick out to the left over #viewport, so the
// toolbar has to stack above every overlay in it (the editor pane, landing
// page, ...). Without that, the overlay showing hides every tooltip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const css = readFileSync(new URL("../sidebar.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const html = readFileSync(new URL("../sidebar.html", import.meta.url), "utf8");

// The declarations of the rule whose selector is exactly `selector`.
function rule(selector) {
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (sel.split(",").map((s) => s.trim()).includes(selector)) {
      return Object.fromEntries(body.split(";").map((d) => d.split(":").map((x) => x.trim())).filter(([k]) => k));
    }
  }
  return {};
}

test("the toolbar stacks above every overlay in the viewport", () => {
  const { document } = new JSDOM(html).window;
  const overlays = [...document.querySelectorAll("#viewport > [id]")].map((el) => `#${el.id}`);
  assert.ok(overlays.includes("#editor-pane"));
  const toolbar = rule("#toolbar");
  assert.notEqual(toolbar.position ?? "static", "static", "z-index needs a positioned toolbar");
  const top = Number(toolbar["z-index"]);
  for (const sel of overlays) {
    const z = Number(rule(sel)["z-index"] ?? 0);
    assert.ok(top > z, `#toolbar z-index ${top} must be above ${sel}'s ${z}`);
  }
});
