import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ASSET_MAX_BYTES, assetPath, brokenLinks, buildAssets, buildGuide, GUIDE_OUT, headingsOf, imageProblems, leaksIn, render, slugify } from "./guide-bundle.mjs";

test("the bundled guide is current: run `npm run docs:guide` after editing docs/guide", () => {
  assert.equal(readFileSync(GUIDE_OUT, "utf8").replace(/\r\n/g, "\n"), render(buildGuide()));
});

test("every page has a title, a known audience and a unique id", () => {
  const pages = buildGuide();
  assert.ok(pages.length >= 50);
  assert.equal(new Set(pages.map((page) => page.id)).size, pages.length);
  for (const page of pages) {
    assert.ok(page.title && page.title !== page.doc, page.doc);
    assert.ok(["player", "setup", "author"].includes(page.audience), page.doc);
  }
});

test("every link between guide pages lands on a page and, when it names one, a heading", () => {
  assert.deepEqual(brokenLinks(buildGuide()), []);
});

test("a link to a missing page or heading is reported", () => {
  const pages = [{ doc: "a.md", body: "[x](b.md) [y](a.md#nope) [z](https://example.com)", headings: [] }];
  assert.deepEqual(brokenLinks(pages), ["a.md -> b.md", "a.md -> a.md#nope (no heading)"]);
});

test("heading slugs follow GitHub: code marks and punctuation dropped, repeats numbered", () => {
  assert.equal(slugify("The `/story` command"), "the-story-command");
  assert.deepEqual(headingsOf("# A\n## Same\n```\n# not\n```\n## Same").map((h) => h.slug), ["a", "same", "same-1"]);
});

test("the shipped guide names no machine path, internal plan or private evidence", () => {
  assert.deepEqual(leaksIn(buildGuide()), []);
});

test("every guide image comes from docs/guide/assets, has alt text, is used and is small", () => {
  const assets = buildAssets();
  assert.ok(assets.length >= 1, "no guide images");
  assert.deepEqual(imageProblems(buildGuide(), assets), []);
  assert.match(render(buildGuide(), assets), /"assets\/[^"]+\.png": "data:image\/png;base64,/);
});

test("a remote, traversing, alt-less, missing, unused or oversized image is reported", () => {
  const pages = [{ doc: "setup/a.md", body: "![x](https://example.com/a.png) ![](../assets/ok.png) ![y](../../etc/a.png) ![z](../assets/gone.png) ![w](data:image/png;base64,AA)" }];
  const assets = [{ path: "assets/ok.png", bytes: 10, mime: "image/png" }, { path: "assets/big.png", bytes: ASSET_MAX_BYTES + 1, mime: "image/png" }, { path: "assets/x.svg", bytes: 10, mime: null }];
  const problems = imageProblems(pages, assets);
  assert.equal(problems.filter((line) => line.includes("not in docs/guide/assets")).length, 3);
  assert.ok(problems.some((line) => line.includes("no alt text")));
  assert.ok(problems.some((line) => line.includes("gone.png does not exist")));
  assert.ok(problems.some((line) => line.includes("big.png") && line.includes("limit")));
  assert.ok(problems.some((line) => line.includes("x.svg: not a png")));
  assert.equal(assetPath("setup/a.md", "../assets/ok.png"), "assets/ok.png");
  assert.equal(assetPath("setup/a.md", "../assets/ok.png?x=1"), null);
});

test("a planted machine path or internal plan link is caught", () => {
  const pages = [{ doc: "a.md", body: "See `C:\\dev\\campaign` and docs/plans/v2.6/x.md, then https://example.com" }, { doc: "b.md", body: "clean" }];
  assert.equal(leaksIn(pages).length, 2);
});
