import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, measure, namesInLine } from "./phaseA.mjs";

const roster = [
  { id: "dm", name: "DM Narrator" },
  { id: "companion", name: "Arin" },
  { id: "guild_master", name: "Ponticius" },
  { id: "little_brother", name: "Luke" },
];

test("an exact name in any case is canonical, not a split key", () => {
  assert.deepEqual(classify("Arin", roster), { kind: "canonical", id: "companion" });
  assert.deepEqual(classify("ponticius", roster), { kind: "canonical", id: "guild_master" });
});

test("every non-canonical form the condition names is a variant", () => {
  assert.equal(classify("Guild Master", roster).kind, "variant");
  assert.equal(classify("little brother", roster).kind, "variant");
  assert.equal(classify("Narrator", roster).kind, "variant");
  assert.equal(classify("DM", roster).kind, "variant");
  assert.equal(classify("Arin the Ranger", roster).kind, "variant");
  assert.equal(classify("Luke,Arin,Ponticius", roster).kind, "variant");
});

test("a name outside the roster, or any name under an empty roster, is not cast", () => {
  assert.equal(classify("Max", roster).kind, "none");
  assert.equal(classify("Sun Ruins", roster).kind, "none");
  assert.equal(classify("Arin", []).kind, "none");
  assert.equal(classify("Arin", null).kind, "none");
});

test("each store's key is read the way the product parser reads it", () => {
  assert.deepEqual(namesInLine("[knows] Arin | the gate is shut"), [{ store: "epistemic", name: "Arin" }]);
  assert.deepEqual(namesInLine("[hiding] Ponticius from Max,Arin | the contract"), [{ store: "epistemic", name: "Ponticius" }]);
  assert.deepEqual(namesInLine("[state:Luke:character] mood=scared"), [{ store: "ledger", name: "Luke" }]);
  assert.deepEqual(namesInLine('MEMORY type=scene importance=2 expiration=scene entity="Arin,Guild Master" text="x" evidence="y"'), [
    { store: "memory", name: "Arin" }, { store: "memory", name: "Guild Master" },
  ]);
  assert.deepEqual(namesInLine("[arc] The party must choose"), []);
});

const journal = (events) => {
  const dir = mkdtempSync(join(tmpdir(), "sp3-"));
  const file = join(dir, "journal-follow.jsonl");
  writeFileSync(file, events.map((event) => JSON.stringify(event)).join("\n"));
  return file;
};

test("measure counts a planted split key and a planted director miss, and dedupes a repeated audit", () => {
  const audit = { kind: "audit", summary: "audit cadence msgs 0-2", detail: { window: { from: 0, to: 2 }, rawResponse: "[knows] Arin | a\n[state:Guild Master:character] mood=calm\n[knows] Max | b" } };
  const file = journal([
    { kind: "session", detail: { storyId: "sun-ruins" } },
    audit,
    audit,
    { kind: "talk", at: "t1", summary: "Arin speaks (director)" },
    { kind: "talk", at: "t2", summary: "Luke speaks (fallback)" },
  ]);
  const result = measure([file]);
  assert.equal(result.castRows, 2);
  assert.equal(result.variantRows, 1);
  assert.equal(result.decisions, 2);
  assert.equal(result.misses, 1);
});

test("control: the same rows with the canonical name measure no split key", () => {
  const file = journal([
    { kind: "session", detail: { storyId: "sun-ruins" } },
    { kind: "audit", summary: "a", detail: { window: {}, rawResponse: "[knows] Arin | a\n[state:Ponticius:character] mood=calm" } },
  ]);
  const result = measure([file]);
  assert.equal(result.castRows, 2);
  assert.equal(result.variantRows, 0);
});
