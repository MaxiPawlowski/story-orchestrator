import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { firstLine, inventory } from "./inventory.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "so-inventory-"));
  const data = join(root, "data", "default-user");
  const put = (path, value) => { mkdirSync(dirname(join(data, path)), { recursive: true }); writeFileSync(join(data, path), typeof value === "string" ? value : JSON.stringify(value)); };
  put("worlds/Story Orchestrator - Sun Ruins - chat-1.json", { entries: { 0: { comment: "so-owner", content: "{}" }, 1: { comment: "fact" } } });
  put("worlds/Story Orchestrator - Sun Ruins.json", { entries: { 0: { comment: "fact" } } });
  put("worlds/Xentar Checkpoints.json", { entries: { 0: { comment: "CP1" } } });
  put("settings.json", { extension_settings: { "story-orchestrator": { settings: {}, v2Stories: [{ id: "a" }, { id: "b" }], wizardSessions: [{ key: "k", applied: ["Arin", "Lore"], createdLorebooks: ["Lore"] }] }, other: { x: 1 } } });
  put("chats/Arin/one.jsonl", `${JSON.stringify({ chat_metadata: { story_orchestrator: { version: 5 } } })}\n{"mes":"hi"}\n`);
  put("chats/Arin/two.jsonl", `${JSON.stringify({ chat_metadata: { note_prompt: "x" } })}\n`);
  put("group chats/g1.jsonl", `${JSON.stringify({ chat_metadata: { story_orchestrator: { version: 5 }, pad: "p".repeat(200_000) } })}\n`);
  put("secrets.json", { typesafe_api_key: [{ id: "1", value: "sk-SECRET-VALUE" }], api_key_openai: "sk-other" });
  mkdirSync(join(data, "vectors", "transformers", "so_consol_1_ab"), { recursive: true });
  mkdirSync(join(data, "vectors", "transformers", "chat_42"), { recursive: true });
  mkdirSync(join(root, "plugins", "story-orchestrator-judge"), { recursive: true });
  mkdirSync(join(root, "plugins", "story-orchestrator-media"), { recursive: true });
  mkdirSync(join(root, "plugins", "someone-else"), { recursive: true });
  return { root, data };
}

test("UN: the inventory lists exactly what we own, and never a foreign book, chat, vector or plugin", () => {
  const { root, data } = fixture();
  try {
    const out = inventory({ dataRoot: data, stRoot: root });
    assert.deepEqual(out.mirrorBooks, [
      { file: "worlds/Story Orchestrator - Sun Ruins - chat-1.json", owner: true },
      { file: "worlds/Story Orchestrator - Sun Ruins.json", owner: false },
    ]);
    assert.deepEqual(out.settings, { keys: ["settings", "v2Stories", "wizardSessions"], libraryStories: 2, wizardSessions: 1, wizardAssets: ["Arin", "Lore"], wizardLorebooks: ["Lore"] });
    assert.deepEqual(out.chats, [{ file: "chats/Arin/one.jsonl", kind: "solo" }, { file: "group chats/g1.jsonl", kind: "group" }]);
    assert.equal(out.judgeKey, true);
    assert.deepEqual(out.transientVectors, ["vectors/transformers/so_consol_1_ab"]);
    assert.deepEqual(out.plugins, ["story-orchestrator-judge", "story-orchestrator-media"]);
    assert.ok(!JSON.stringify(out).includes("sk-SECRET-VALUE"), "the judge key is reported by presence only");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("UN control: an install that never ran the extension inventories as empty", () => {
  const root = mkdtempSync(join(tmpdir(), "so-inventory-empty-"));
  try {
    mkdirSync(join(root, "worlds"), { recursive: true });
    writeFileSync(join(root, "settings.json"), JSON.stringify({ extension_settings: {} }));
    assert.deepEqual(inventory({ dataRoot: root }), { kind: "story-orchestrator-inventory", mirrorBooks: [], settings: null, chats: [], judgeKey: false, transientVectors: [], plugins: null });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("firstLine reads a header longer than one buffer and stops at the newline", () => {
  const root = mkdtempSync(join(tmpdir(), "so-inventory-line-"));
  try {
    const line = JSON.stringify({ chat_metadata: { pad: "x".repeat(300_000) } });
    writeFileSync(join(root, "c.jsonl"), `${line}\n{"mes":"after"}\n`);
    assert.equal(firstLine(join(root, "c.jsonl")), line);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
