import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brokenLinks, buildGuide, GUIDE_OUT, headingsOf, leaksIn, render, slugify } from "./guide-bundle.mjs";

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

test("a planted machine path or internal plan link is caught", () => {
  const pages = [{ doc: "a.md", body: "See `C:\\dev\\campaign` and docs/plans/v2.6/x.md, then https://example.com" }, { doc: "b.md", body: "clean" }];
  assert.equal(leaksIn(pages).length, 2);
});
