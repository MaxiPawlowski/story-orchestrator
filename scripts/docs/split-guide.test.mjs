import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUT, ROOT, SOURCE, groupTopics, parseGuide, renderPages, staleIssues, writePages } from "./split-guide.mjs";

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
    const topic = parseGuide(guide).topics.find((entry) => entry.title === "Dramatic shape");
    assert.ok(topic, "the edited heading is a topic");
    const edited = `topics/${topic.id}.md`;
    const issues = staleIssues(root);
    for (const rel of [edited, "README.md"]) assert.ok(issues.includes(`${OUT}/${rel} is stale`), issues.join(", "));
    assert.ok(issues.every((issue) => issue.endsWith(" is stale")), issues.join(", "));
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

test("the author index lists every topic once, grouped, and an ungrouped topic lands in More topics", () => {
  const topics = parseGuide(guide).topics;
  const listed = groupTopics(topics).flatMap(([, items]) => items.map((topic) => topic.id));
  assert.deepEqual([...listed].sort(), topics.map((topic) => topic.id).sort());
  const extra = [...topics, { id: "brand-new", title: "Brand new" }];
  assert.deepEqual(groupTopics(extra).at(-1), ["More topics", [{ id: "brand-new", title: "Brand new" }]]);
  assert.ok(!renderPages(guide).get("README.md").split("## For contributors")[0].includes("src/engine/schema.ts"));
});
