import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { buildSite, fileFor, relativeHref } from "./guide-site.mjs";

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
  assert.equal(relativeHref("author/topics/gates", { id: "author/README" }), "../index.html");
  assert.equal(dirname("x"), ".");
});
