import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { floorProblems, parityProblems, planRowTokens, planTableRows, rowProblems } from "./phaseCManifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(readFileSync(join(root, "test", "phase-c", "manifest.json"), "utf8"));
const plan = readFileSync(join(root, "docs", "plans", "v2.7", "39-test-from-zero.md"), "utf8");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

const BINARY = manifest.binaryFloor;
const RECORD = manifest.recordOnly;
const row = (over = {}) => ({
  id: "X-1",
  stage: "C2",
  source: { plan: "v2.7 39", section: "§Rows" },
  prerequisites: ["a lane"],
  reset: "lane",
  tier: ["D"],
  assertion: "the thing holds on the lane",
  floor: { text: BINARY, citation: "39 §Rows" },
  evidence: [null, null],
  ...over,
});
const synthetic = (rows, over = {}) => ({ ...manifest, rows, absent: [], ...over });
const PLAN = [
  "| Id | Stage |",
  "|---|---|",
  "| X-1 | C2 |",
  "",
  "| Row | Setup |",
  "|---|---|",
  "| X-2 label | a lane |",
  "",
  "| Step | What |",
  "|---|---|",
  "| C9 | not a row table |",
  "",
  "C5 runs O3–O5 and S-04..S-06.",
].join("\n");

test("the Phase C manifest: every row has every field, ids are unique, floors can fail", () => {
  assert.equal(manifest.version, version, "the manifest and package.json disagree on the version");
  assert.deepEqual(rowProblems(manifest), []);
  assert.ok(manifest.rows.length >= 150, `only ${manifest.rows.length} rows`);
});

test("the manifest and plan 39 name the same rows, both ways", () => {
  assert.deepEqual(parityProblems(manifest, plan), []);
});

test("the B1 pod-sizing row is in the manifest and in plan 39, and dropping either side is named", () => {
  const sizing = manifest.rows.find((entry) => entry.id === "B1-PAR");
  assert.ok(sizing, "the manifest has no B1-PAR row");
  assert.equal(sizing.stage, "B1");
  assert.match(sizing.floor.text, /25 tok\/s/);
  assert.ok(planRowTokens(plan).includes("B1-PAR"), "plan 39 never mentions B1-PAR");
  assert.match(parityProblems({ ...manifest, rows: manifest.rows.filter((entry) => entry.id !== "B1-PAR") }, plan).join("\n"), /B1-PAR/);
  const unlisted = plan.split(/\r?\n/).filter((line) => !line.startsWith("| B1-PAR")).join("\n");
  assert.match(parityProblems(manifest, unlisted).join("\n"), /manifest row B1-PAR is not named/);
});

test("the B1 empty-reply row is in the manifest and in plan 39 with its predeclared floor, and dropping either side is named", () => {
  const empty = manifest.rows.find((entry) => entry.id === "B1-EMPTY");
  assert.ok(empty, "the manifest has no B1-EMPTY row");
  assert.equal(empty.stage, "B1");
  assert.match(empty.floor.text, /<= 1 per 200 turns/);
  assert.match(empty.floor.text, /100%/);
  assert.ok(planRowTokens(plan).includes("B1-EMPTY"), "plan 39 never mentions B1-EMPTY");
  assert.match(parityProblems({ ...manifest, rows: manifest.rows.filter((entry) => entry.id !== "B1-EMPTY") }, plan).join("\n"), /B1-EMPTY/);
  const unlisted = plan.split(/\r?\n/).filter((line) => !line.startsWith("| B1-EMPTY")).join("\n");
  assert.match(parityProblems(manifest, unlisted).join("\n"), /manifest row B1-EMPTY is not named/);
});

test("the predecessor is a full commit and the absent rows give a reason", () => {
  assert.match(manifest.predecessor.commit, /^[0-9a-f]{40}$/);
  assert.ok(plan.includes(manifest.predecessor.commit), "plan 39 does not record the pinned predecessor");
  for (const entry of manifest.absent) assert.ok(plan.includes(entry.id), `${entry.id} is absent and plan 39 never names it`);
});

test("planted controls: a missing field, a duplicate, an unknown tier, a build field, a bad evidence slot are each named", () => {
  assert.deepEqual(rowProblems(synthetic([row()])), []);
  const named = (rows) => rowProblems(synthetic(rows)).join("\n");
  assert.match(named([row(), row()]), /X-1: duplicate id/);
  assert.match(named([row({ prerequisites: [] })]), /no prerequisites/);
  assert.match(named([row({ reset: "none" })]), /unknown reset/);
  assert.match(named([row({ tier: ["GPU"] })]), /tier/);
  assert.match(named([row({ tier: [] })]), /tier/);
  assert.match(named([row({ build: "dev-diagnostic" })]), /X-1: carries a build field, but there is one build/);
  assert.match(named([row({ build: "prod" })]), /one build/);
  assert.match(named([row({ assertion: "" })]), /no assertion/);
  assert.match(named([row({ source: { plan: "v2.7 39" } })]), /source needs plan and section/);
  assert.match(named([row({ evidence: [null] })]), /two slots/);
  assert.match(named([row({ stage: "C9" })]), /unknown stage/);
  assert.match(named([row({ floor: { text: "≥ 9 of 10" } })]), /no citation/);
  const { id: _, ...noId } = row();
  assert.match(named([noId]), /a row has no id/);
  assert.match(rowProblems(synthetic([row()], { absent: [{ id: "X-1", why: "removed on purpose because of a planted reason" }] })).join("\n"), /listed as absent and as a row/);
});

test("planted controls: a floor that cannot fail is refused, a real one passes", () => {
  const check = (text) => floorProblems({ id: "F", floor: { text, citation: "plan §x" } }, manifest);
  assert.deepEqual(check(BINARY), []);
  assert.deepEqual(check(RECORD), []);
  assert.deepEqual(check("≥ 9 of 10 render; the rest refuse with a named reason; 0 silent failures"), []);
  assert.deepEqual(check("direction accuracy ≥ 0.80"), []);
  assert.match(check("10 of 10 render or refuse with a reason").join(), /cannot fail/);
  assert.match(check("timeouts ≥ 0").join(), /cannot fail/);
  assert.match(check("at most 100 % stuck").join(), /cannot fail/);
  assert.match(check("passes where possible").join(), /cannot fail/);
  assert.match(check("looks good to the rater").join(), /nothing that can be measured/);
});

test("planted controls: plan parity is checked both ways", () => {
  const rows = [row(), row({ id: "X-2", labels: ["X-2 label"] }), ...["O3", "O4", "O5", "S-04", "S-05", "S-06"].map((id) => row({ id }))];
  assert.deepEqual(planTableRows(PLAN), ["X-1", "X-2 label"]);
  assert.deepEqual(planRowTokens(PLAN), ["O3", "O4", "O5", "S-04", "S-05", "S-06"]);
  const index = `${PLAN}\n\n| Id | x |\n|---|---|\n${["O3", "O4", "O5", "S-04", "S-05", "S-06"].map((id) => `| ${id} | x |`).join("\n")}\n`;
  assert.deepEqual(parityProblems(synthetic(rows), index), []);
  assert.match(parityProblems(synthetic(rows.filter((r) => r.id !== "X-2")), index).join("\n"), /names row "X-2 label"/);
  assert.match(parityProblems(synthetic(rows.filter((r) => r.id !== "O4")), index).join("\n"), /mentions O4/);
  assert.match(parityProblems(synthetic([...rows, row({ id: "X-9" })]), index).join("\n"), /X-9 is not named/);
  assert.match(parityProblems(synthetic(rows), `${index}| X-1 | again |\n`).join("\n"), /X-1 more than once/);
  assert.deepEqual(parityProblems(synthetic(rows.filter((r) => r.id !== "O4"), { absent: [{ id: "O4", why: "planted: dropped on purpose" }] }), index), []);
});
