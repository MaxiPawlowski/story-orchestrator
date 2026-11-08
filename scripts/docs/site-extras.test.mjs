import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildGuide } from "./guide-bundle.mjs";
import { buildSite } from "./guide-site.mjs";
import {
  brokenSiteLinks, demoDirs, demoProblems, denyTerms, exportsName, mediaProblems, overBudget, PAGE_BUDGET_BYTES, pageWeights,
  prepareSitePage, privacyHits, sitePages, sourceList, sourceProblems,
} from "./site-extras.mjs";
import { testTempDirSync } from "../lib/testTemp.mjs";

const out = testTempDirSync("guide-site-x-");
await buildSite({ out, homePage: "https://github.com/o/r" });
const scratch = testTempDirSync("guide-site-fixture-");
test.after(() => { rmSync(out, { recursive: true, force: true }); rmSync(scratch, { recursive: true, force: true }); });

const write = (path, text) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text); };
const how = sitePages().filter((page) => page.audience === "how" && !page.id.endsWith("/README"));

test("nine How it works pages, each with a diagram and a Sources list whose files and exported symbols all exist", () => {
  assert.equal(how.length, 9);
  for (const page of how) {
    assert.match(page.body, /^```mermaid$/m, page.doc);
    assert.ok(sourceList(page.body).length >= 3, page.doc);
  }
  assert.deepEqual(sourceProblems(how), []);
});

test("control: a vanished file, export or method fails the source check", () => {
  const body = "# X\n\n## Sources\n\n- `src/gone.ts`: `A`\n- `src/runtime/turnBridge.ts`: `TurnBridge`, `NoSuchExport`, `TurnBridge.noSuchMethod`\n- `src/engine/engine.ts`:\n";
  const problems = sourceProblems([{ doc: "how/x.md", body }]);
  assert.ok(problems.some((line) => line.includes("src/gone.ts no longer exists")));
  assert.ok(problems.some((line) => line.includes("no longer exports NoSuchExport")));
  assert.ok(problems.some((line) => line.includes("has no TurnBridge.noSuchMethod")));
  assert.ok(problems.some((line) => line.includes("lists no symbol")));
  assert.deepEqual(sourceProblems([{ doc: "how/y.md", body: "# Y" }]), ['how/y.md: no "## Sources" list']);
  assert.ok(exportsName("export async function a() {}", "a"));
  assert.ok(exportsName("const b = 1;\nexport { b as c, type d };", "c") && exportsName("export { type d };", "d"));
  assert.ok(exportsName("exports.e = 1", "e") && !exportsName("const f = 1", "f"));
});

test("site-only sections stay out of the in-extension guide bundle", () => {
  assert.ok(!buildGuide().some((page) => /^(how|showcase)\//.test(page.doc)));
});

test("site pages turn mermaid and embed fences, showcase media and site links into HTML", () => {
  const page = { doc: "showcase/x.md", body: "# X\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\n```embed\nsrc: demo/index.html\ntitle: Demo\nheight: 300\n```\n\n![A clip](../assets/showcase/a.webm)\n\nSee ![still](../assets/showcase/b.png) and [the demo](demo/).\n" };
  const prepared = prepareSitePage(page);
  assert.ok(prepared.mermaid);
  const html = prepared.finish(prepared.body.split(/\n\n+/).map((part) => `<p>${part.trim()}</p>`).join(""));
  assert.match(html, /<pre class="mermaid">flowchart TD\n {2}A --&gt; B<\/pre>/);
  assert.match(html, /<iframe src="demo\/index.html" title="Demo" loading="lazy" style="height:300px">/);
  assert.match(html, /<figure class="media"><video src="\.\.\/assets\/showcase\/a\.webm" controls muted loop/);
  assert.match(html, /<img src="\.\.\/assets\/showcase\/b\.png" alt="still" loading="lazy">/);
  assert.match(html, /<a href="demo\/">the demo<\/a>/);
  assert.throws(() => prepareSitePage({ doc: "showcase/y.md", body: "```embed\nsrc: https://example.com\ntitle: X\n```\n" }), /local src/);
  assert.throws(() => prepareSitePage({ doc: "showcase/y.md", body: "![](../assets/showcase/a.png)" }), /no alt text/);
});

test("every showcase media file records the build, source and licence it came from", () => {
  assert.deepEqual(mediaProblems(), []);
  const dir = join(scratch, "media");
  write(join(dir, "ok.webp"), "x");
  write(join(dir, "ok.webp.json"), JSON.stringify({ build: "f7bf963b6", source: "lane recording", licence: "CC0" }));
  write(join(dir, "bare.png"), "x");
  write(join(dir, "bad.gif"), "x");
  write(join(dir, "bad.gif.json"), JSON.stringify({ build: "HEAD" }));
  write(join(dir, "clip.mov"), "x");
  write(join(dir, "orphan.png.json"), "{}");
  const problems = mediaProblems(dir);
  assert.ok(!problems.some((line) => line.includes("ok.webp")));
  assert.ok(problems.some((line) => line.includes("bare.png: no bare.png.json")));
  assert.ok(problems.some((line) => line.includes("bad.gif.json: build")));
  assert.ok(problems.some((line) => line.includes("bad.gif.json: licence")));
  assert.ok(problems.some((line) => line.includes("clip.mov: not one of")));
  assert.ok(problems.some((line) => line.includes("orphan.png.json: sidecar without")));
});

test("standalone demos need an index.html and only pinned CDN scripts", () => {
  assert.deepEqual(demoProblems(demoDirs()), []);
  const dir = join(scratch, "demos");
  write(join(dir, "good", "index.html"), '<script type="module" src="main.js"></script><script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"></script>');
  write(join(dir, "good", "main.js"), 'import x from "https://unpkg.com/pixi.js@8.1.0/dist/pixi.mjs";');
  write(join(dir, "loose", "index.html"), '<script src="https://cdn.jsdelivr.net/npm/three/build/three.module.js"></script>');
  write(join(dir, "Bad_Name", "page.html"), "");
  const problems = demoProblems(demoDirs(dir));
  assert.ok(!problems.some((line) => line.includes("showcase/good")));
  assert.ok(problems.some((line) => line.includes("showcase/loose") && line.includes("pinned")));
  assert.ok(problems.some((line) => line.includes("showcase/Bad_Name: name")));
  assert.ok(problems.some((line) => line.includes("showcase/Bad_Name: no index.html")));
});

test("the built site has no broken link and no page over its size budget", () => {
  assert.deepEqual(brokenSiteLinks(out), []);
  const weights = pageWeights(out);
  assert.ok(weights.length >= 40);
  assert.deepEqual(overBudget(weights), []);
});

test("control: a broken link, a missing anchor and an oversized page are caught", () => {
  const site = join(scratch, "site");
  write(join(site, "index.html"), '<a href="gone.html">x</a><a href="b.html#nope">y</a><a href="dir/">z</a><img src="big.webp" alt="b"><a href="#here">h</a>');
  write(join(site, "b.html"), '<h2 id="there">B</h2>');
  write(join(site, "dir", "index.html"), "ok");
  writeFileSync(join(site, "big.webp"), Buffer.alloc(PAGE_BUDGET_BYTES + 1));
  write(join(site, "ui", "index.html"), '<a href="nowhere.html">storybook internals are not checked</a>');
  assert.deepEqual(brokenSiteLinks(site), ["index.html -> gone.html", "index.html -> b.html#nope (no heading)", "index.html -> #here (no heading)"]);
  assert.deepEqual(overBudget(pageWeights(site)).length, 1);
});

test("the built site carries no secret or owner path", () => {
  assert.deepEqual(privacyHits(out), []);
});

test("control: planted secrets, owner paths and deny-list terms are caught, and the deny list is optional", () => {
  const site = join(scratch, "leaky");
  const key = ["sk", "-", "a".repeat(24)].join("");
  write(join(site, "a.html"), `token ${key}\nC:${"\\"}dev${"\\"}x\n"C:${"\\\\"}Users${"\\\\"}y"\n/home/someone/x\n/home/runner/work is fine\nWidgetName here\n`);
  write(join(site, "b.js"), `-----BEGIN ${"OPENSSH"} PRIVATE KEY-----`);
  const hits = privacyHits(site, { terms: ["widgetname"] });
  assert.ok(hits.includes("a.html:1: OpenAI-style key"));
  assert.ok(hits.includes("a.html:2: owner machine path"));
  assert.ok(hits.includes("a.html:3: owner machine path"));
  assert.ok(hits.includes("a.html:4: owner home path"));
  assert.ok(!hits.some((line) => line.startsWith("a.html:5:")));
  assert.ok(hits.includes("a.html:6: deny-list term #1"));
  assert.ok(hits.includes("b.js:1: private key"));
  assert.deepEqual(denyTerms({ env: {}, file: join(scratch, "absent.txt") }), { source: null, terms: [] });
  write(join(scratch, "deny.txt"), "# comment\nOne\n\nTwo\n");
  assert.deepEqual(denyTerms({ env: { SO_SITE_DENY_FILE: join(scratch, "deny.txt") } }).terms, ["One", "Two"]);
});
