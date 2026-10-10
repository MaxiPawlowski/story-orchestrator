import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUT, ROOT, SOURCE, TOPIC_GROUPS, fieldsFile, groupTopics, parseGuide, renderPages, staleIssues, writePages } from "./split-guide.mjs";
import { headingsOf } from "./guide-bundle.mjs";

const guide = readFileSync(join(ROOT, SOURCE), "utf8");

test("docs/guide/author matches docs/authoring/story-guide.md (run npm run docs:guide)", () => {
  assert.deepEqual(staleIssues(), []);
});

test("every topic marker in the source becomes one section of its group page, anchored by its id", () => {
  const markers = [...guide.matchAll(/<!-- topic: ([a-z0-9-]+) -->/g)].map((match) => match[1]);
  assert.deepEqual(parseGuide(guide).topics.map((topic) => topic.id), markers);
  const pages = renderPages(guide);
  const anchored = TOPIC_GROUPS.flatMap((group) => headingsOf(pages.get(fieldsFile(group))).filter((heading) => heading.level === 2).map((heading) => heading.slug));
  assert.deepEqual([...anchored].sort(), [...markers].sort());
  assert.deepEqual(TOPIC_GROUPS.flatMap((group) => headingsOf(pages.get(fieldsFile(group))).filter((heading) => heading.level === 2).map((heading) => heading.slug)), TOPIC_GROUPS.flatMap((group) => group.topics));
  assert.equal([...pages.keys()].filter((rel) => rel.startsWith("fields/")).length, TOPIC_GROUPS.length);
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
    const edited = fieldsFile(TOPIC_GROUPS.find((group) => group.topics.includes(topic.id)));
    const issues = staleIssues(root);
    for (const rel of [edited, "README.md"]) assert.ok(issues.includes(`${OUT}/${rel} is stale`), issues.join(", "));
    assert.ok(issues.every((issue) => issue.endsWith(" is stale")), issues.join(", "));
    writeFileSync(join(root, SOURCE), guide);
    writeFileSync(join(root, OUT, "fields/tracking.md"), "edited by hand");
    assert.deepEqual(staleIssues(root), [`${OUT}/fields/tracking.md is stale`]);
    writePages(root);
    writeFileSync(join(root, OUT, "fields/gone.md"), readFileSync(join(root, OUT, "fields/tracking.md"), "utf8"));
    assert.deepEqual(staleIssues(root), [`${OUT}/fields/gone.md is generated but no longer in the guide`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control: a heading without a topic marker is refused", () => {
  assert.throws(() => parseGuide(guide.replace("<!-- topic: tension -->\n", "").replace("<!-- topic: tension -->\r\n", "")), /no topic marker/);
});

test("every topic sits in exactly one group, and an ungrouped, unknown or repeated topic is refused", () => {
  const topics = parseGuide(guide).topics;
  const listed = groupTopics(topics).flatMap((group) => group.items.map((topic) => topic.id));
  assert.deepEqual([...listed].sort(), topics.map((topic) => topic.id).sort());
  assert.throws(() => groupTopics([...topics, { id: "brand-new", title: "Brand new" }]), /topics in no group: brand-new/);
  assert.throws(() => groupTopics(topics, [...TOPIC_GROUPS, { page: "x", title: "X", topics: ["gates", "nope"] }]), /unknown or repeated topics: gates, nope/);
  const readme = renderPages(guide).get("README.md");
  assert.ok(!readme.split("## For contributors")[0].includes("src/engine/schema.ts"));
  for (const group of TOPIC_GROUPS) for (const id of group.topics) assert.ok(readme.includes(`](${fieldsFile(group)}#${id})`), id);
});
