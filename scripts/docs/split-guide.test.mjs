import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUT, ROOT, SOURCE, parseGuide, renderPages, staleIssues, writePages } from "./split-guide.mjs";

const guide = readFileSync(join(ROOT, SOURCE), "utf8");

test("docs/guide/author matches docs/authoring/story-guide.md (run npm run docs:guide)", () => {
  assert.deepEqual(staleIssues(), []);
});

test("every topic marker in the source becomes one page, in order", () => {
  const markers = [...guide.matchAll(/<!-- topic: ([a-z0-9-]+) -->/g)].map((match) => match[1]);
  assert.deepEqual(parseGuide(guide).topics.map((topic) => topic.id), markers);
  const pages = renderPages(guide);
  assert.deepEqual(markers.filter((id) => !pages.has(`topics/${id}.md`)), []);
});

test("control: an edited source, an edited page and a leftover page are each reported", () => {
  const root = mkdtempSync(join(tmpdir(), "split-guide-"));
  try {
    mkdirSync(join(root, "docs/authoring"), { recursive: true });
    writeFileSync(join(root, SOURCE), guide);
    writePages(root);
    assert.deepEqual(staleIssues(root), []);
    writeFileSync(join(root, SOURCE), guide.replace("### Dramatic shape", "### Dramatic shapes"));
    assert.deepEqual(staleIssues(root).sort(), [`${OUT}/README.md`, `${OUT}/topics/arc-template.md`, `${OUT}/topics/briefing.md`, `${OUT}/topics/requirements.md`].map((path) => `${path} is stale`));
    writeFileSync(join(root, SOURCE), guide);
    writeFileSync(join(root, OUT, "topics/latching.md"), "edited by hand");
    assert.deepEqual(staleIssues(root), [`${OUT}/topics/latching.md is stale`]);
    writePages(root);
    writeFileSync(join(root, OUT, "topics/gone.md"), readFileSync(join(root, OUT, "topics/latching.md"), "utf8"));
    assert.deepEqual(staleIssues(root), [`${OUT}/topics/gone.md is generated but no longer in the guide`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control: a heading without a topic marker is refused", () => {
  assert.throws(() => parseGuide(guide.replace("<!-- topic: tension -->\n", "").replace("<!-- topic: tension -->\r\n", "")), /no topic marker/);
});
