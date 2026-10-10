import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { buildSite, fileFor, homeLayout, navSections, relativeHref } from "./guide-site.mjs";

const out = mkdtempSync(join(tmpdir(), "guide-site-"));
const built = await buildSite({ out, homePage: "https://github.com/o/r" });
const pageFiles = JSON.parse(readFileSync(join(out, "search-index.json"), "utf8")).map((entry) => entry.url);

test.after(() => rmSync(out, { recursive: true, force: true }));

test("every bundled page becomes one HTML file, plus the search index", () => {
  assert.equal(pageFiles.length, built.pages);
  for (const file of pageFiles) assert.ok(existsSync(join(out, file)), file);
  assert.ok(existsSync(join(out, "index.html")));
  assert.ok(existsSync(join(out, ".nojekyll")));
});

test("every link between pages lands on a generated file and, when it names a heading, on its id", () => {
  const broken = [];
  for (const file of pageFiles) {
    const html = readFileSync(join(out, file), "utf8");
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [path, anchor] = href.split("#");
      const target = posix.normalize(posix.join(posix.dirname(file), path));
      if (!existsSync(join(out, target))) { broken.push(`${file} -> ${href}`); continue; }
      if (anchor && !readFileSync(join(out, target), "utf8").includes(`id="${anchor}"`)) broken.push(`${file} -> ${href} (no heading)`);
    }
  }
  assert.deepEqual(broken, []);
});

test("the only script on a page is the search script, and page content carries no raw HTML from the docs", () => {
  for (const file of pageFiles) {
    const html = readFileSync(join(out, file), "utf8");
    assert.equal((html.match(/<script/g) ?? []).length, 1, file);
    assert.doesNotMatch(html.split("<main>")[1].split("<script>")[0], /<(script|iframe|object)\b|on[a-z]+=/i, file);
  }
});

test("guide images are copied into the site and each img points at a copied asset", () => {
  let images = 0;
  for (const file of pageFiles) {
    const main = readFileSync(join(out, file), "utf8").split("<main>")[1].split("<script>")[0];
    for (const [tag] of main.matchAll(/<img\b[^>]*>/g)) {
      images += 1;
      const src = /src="([^"]+)"/.exec(tag)?.[1] ?? "";
      assert.doesNotMatch(src, /^(?:[a-z]+:|\/)/i, `${file}: ${src}`);
      const target = posix.normalize(posix.join(posix.dirname(file), src));
      assert.match(target, /^assets\//, `${file}: ${src}`);
      assert.ok(existsSync(join(out, target)), `${file}: ${src}`);
      assert.match(tag, /alt="[^"]+"/, `${file}: ${tag}`);
    }
  }
  assert.ok(images >= 1, "no page carries an image");
});

test("README pages map to index.html and relative links climb directories", () => {
  assert.equal(fileFor("README"), "index.html");
  assert.equal(fileFor("player/README"), "player/index.html");
  assert.equal(relativeHref("player/playing", { id: "setup/judge", anchor: "keys" }), "../setup/judge.html#so-guide-h-keys");
  assert.equal(relativeHref("author/fields/moving-on", { id: "author/README" }), "../index.html");
  assert.equal(dirname("x"), ".");
});

test("the home page lays its guide sections out as cards and marks the quick start", () => {
  const html = readFileSync(join(out, "index.html"), "utf8");
  assert.match(html, /<p class="primary"><strong>New here\?/);
  assert.equal((html.match(/<section class="card">/g) ?? []).length, 4);
  assert.match(html, /href="quick-start\.html"/);
});

test("the nav lists every page once, in the guide's own sections and order", () => {
  const html = readFileSync(join(out, "author/fields/moving-on.html"), "utf8");
  const nav = html.split("<nav")[1].split("</nav>")[0];
  const links = [...nav.matchAll(/href="([^"]+)"/g)].map((match) => posix.normalize(posix.join("author/fields", match[1])));
  assert.equal(new Set(links).size, links.length);
  assert.deepEqual([...links].sort(), [...pageFiles].sort());
  const summaries = [...nav.matchAll(/<summary>([^<]+)<\/summary>/g)].map((match) => match[1]);
  assert.deepEqual(summaries, ["Start here", "Play", "Set up", "Start here", "Tools", "Reference", "Story fields"]);
  assert.ok(links.indexOf("author/fields/story.html") < links.indexOf("author/fields/game-layer.html"));
});

test("a page missing from the guide's sections still reaches the nav, under More pages", () => {
  const pages = [
    { id: "author/README", audience: "author", title: "A", body: "" },
    { id: "author/x", audience: "author", title: "X", body: "" },
    { id: "author/y", audience: "author", title: "Y", body: "" },
  ];
  const nav = [{ audience: "author", title: "Group", ids: ["author/README", "author/x", "author/gone"] }];
  assert.deepEqual(navSections(pages, nav), [{ audience: "author", title: "Group", ids: ["author/README", "author/x"] }, { audience: "author", title: "More pages", ids: ["author/y"] }]);
  assert.match(homeLayout("<p><strong>New here?</strong></p><h4>A</h4><p>a</p><ul><li>1</li></ul><h4>B</h4><ul><li>2</li></ul><p>end</p>"), /^<p class="primary">.*<div class="cards"><section class="card"><h4>A<\/h4>.*<\/section><section class="card"><h4>B<\/h4>.*<\/div><p>end<\/p>$/);
});
