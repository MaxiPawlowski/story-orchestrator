import { StoryEngine, parseStoryOrThrow } from "@engine/index";
import { provenance } from "@memory/provenance";
import type { MemoryEntry } from "@memory/types";
import { renderSharedReadPrompt } from "./contract";
import { parseSharedReadResponse } from "./parse";
import { ACT_NEEDS_PLAYER_LINE, NEIGHBOUR_ALIAS_UNKNOWN, readMemoryParts, type ReadMemory } from "./readMemory";
import { runSharedRead } from "./sharedRead";
import type { SharedReadContract } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true, settingsReady: async () => {}, readServerBoundary: async () => null,
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }), getContext: () => ({ chat: [], extensionSettings: {} }) }));

const story = () => parseStoryOrThrow({
  id: "wave-two", title: "Wave two", description: "v3.0 43 M",
  roster: [{ id: "mira", name: "Mira", relationships: [{ toward: "player", axes: ["trust"] }, { toward: "tobin", axes: ["trust"] }] }, { id: "tobin", name: "Tobin" }],
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true }, { id: "island", name: "Island", objective: "Rest", type: "anchor" }],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { act: "lied", by: "player", to: "mira", within: 5 } }],
});

const row = (id: string, text: string, entities: string[]): MemoryEntry => ({
  id, tier: "facts", text, type: "fact", importance: 2, expiration: "permanent", entities, confidence: 1, activationTriggers: [], evidence: text,
  createdAt: 1, messageId: 1, recallCount: 0, provenance: provenance({ source: "extractor", messageId: 1, boundary: 1, pass: "shared-read" }),
});

const memory = (overrides: Partial<ReadMemory> = {}): ReadMemory => ({
  entries: [row("stored-dog", "Mira keeps a grey dog called Ash.", ["Mira", "Ash"]), row("stored-key", "Tobin keeps the cellar key in the pantry.", ["Tobin"])],
  neighbours: true, keys: true, relations: true, acts: true, ...overrides,
});

const window = {
  from: 4, to: 6, messages: [
    { index: 4, messageId: 4, speaker: "Wren", text: "I never touched your letters, Mira.", isUser: true },
    { index: 5, messageId: 5, speaker: "Mira", text: "Tobin says you did. Ash barked all night.", isUser: false },
    { index: 6, messageId: 6, speaker: "Tobin", text: "I moved the cellar key to the attic.", isUser: false },
  ],
};

describe("v3.0 43 M: read-contract wave 2 parse (one fixture per new line kind; every tag optional)", () => {
  const s = story();
  test("MEMORY and FACT lines take same=/update=/keys= before text, between text and evidence, or trailing", () => {
    const parsed = parseSharedReadResponse([
      'MEMORY type=fact importance=2 expiration=permanent entity="Mira" same=m1 keys="grey dog,hound" text="Mira has a dog, Ash." evidence="Ash barked all night."',
      'FACT importance=2 update=m2 text="Tobin moved the cellar key to the attic" evidence="I moved the cellar key to the attic."',
      'FACT importance=1 text="The attic is cold" keys="attic,loft,a,b" evidence="I moved the cellar key to the attic."',
      'FACT importance=1 text="Letters were touched" evidence="I never touched your letters, Mira." keys="letters,mail" same=m3',
      'FACT importance=1 same=m1 update=m2 text="Both tags cancel" evidence="Ash barked all night."',
    ].join("\n"), s);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.memory[0]).toMatchObject({ text: "Mira has a dog, Ash.", neighbour: { kind: "same", id: "m1" }, keys: ["grey dog", "hound"] });
    expect(parsed.facts.map((fact) => [fact.text, fact.neighbour ?? null, fact.keys ?? null])).toEqual([
      ["Tobin moved the cellar key to the attic", { kind: "update", id: "m2" }, null],
      ["The attic is cold", null, ["attic", "loft", "a"]],
      ["Letters were touched", { kind: "same", id: "m3" }, ["letters", "mail"]],
      ["Both tags cancel", null, null],
    ]);
    expect(parsed.facts[2].evidence).toBe("I never touched your letters, Mira.");
  });

  test("F-M2c: at most 3 keys, a key that repeats an entity is dropped", () => {
    const parsed = parseSharedReadResponse('MEMORY type=fact importance=2 expiration=permanent entity="Mira,Ash" keys="Ash,dog,kennel,collar,leash" text="Mira walks Ash." evidence="Ash barked all night."', s);
    expect(parsed.memory[0].keys).toEqual(["dog", "kennel", "collar"]);
  });

  test("relation lines: several objects, an ending, junk refused", () => {
    const parsed = parseSharedReadResponse(["[rel:Mira:ally_of] Tobin", "[rel:Mira:Ally of] Esk.", "[rel-end:Mira:owes] Tobin", "[rel:Mira:ally_of] Mira", "[rel:Mira:] Tobin"].join("\n"), s);
    expect(parsed.ledger).toEqual([
      { entity: "Mira", entityType: "relation", field: "ally_of", value: "yes", object: "Tobin" },
      { entity: "Mira", entityType: "relation", field: "ally_of", value: "yes", object: "Esk" },
      { entity: "Mira", entityType: "relation", field: "owes", value: "ended", object: "Tobin" },
    ]);
    expect(parsed.rejected.map((entry) => entry.reason)).toEqual(["invalid relation line", "invalid relation line"]);
  });

  test("act= rides a rel_ feeling DELTA only, in either position; an unknown act is dropped, the delta kept", () => {
    const parsed = parseSharedReadResponse([
      'DELTA q=rel_mira_player_trust value="down" act=lied evidence="I never touched your letters, Mira."',
      'DELTA q=rel_mira_tobin_trust value="up" evidence="Tobin says you did." act=helped',
      'DELTA q=rel_mira_tobin_trust value="up" act=hugged evidence="Tobin says you did."',
      'DELTA q=crossed value=true act=lied evidence="I moved the cellar key to the attic."',
    ].join("\n"), s, { rel_mira_player_trust: 0, rel_mira_tobin_trust: 0 });
    expect(parsed.rejected).toEqual([]);
    expect(parsed.deltas.map((entry) => [entry.delta.q, entry.delta.act ?? null])).toEqual([
      ["rel_mira_player_trust", "lied"], ["rel_mira_tobin_trust", "helped"], ["rel_mira_tobin_trust", null], ["crossed", null],
    ]);
  });
});

describe("v3.0 43 M: contract text only while a switch is on", () => {
  const s = story();
  const engine = new StoryEngine();
  engine.loadStory(s);
  const base: SharedReadContract = {
    storyTitle: s.title, activeCheckpointId: "bank", qualities: [{ quality: s.qualityByKey.rel_mira_player_trust, key: "rel_mira_player_trust", hints: [] }] as never,
    window, canon: "", epistemicLedgerCapable: true,
  };
  test("the off arm is byte-identical to today's prompt, in both layouts", () => {
    for (const layout of [undefined, "stable-first" as const]) {
      const contract = { ...base, ...(layout ? { layout } : {}) };
      const off = readMemoryParts(memory({ neighbours: false, keys: false, relations: false, acts: false }), window, contract.qualities, { capable: true });
      expect(renderSharedReadPrompt({ ...contract, ...off.contract })).toBe(renderSharedReadPrompt(contract));
    }
  });

  test("each switch adds its own rule; neighbours sit late, before the questions", () => {
    const on = readMemoryParts(memory(), window, base.qualities, { capable: true });
    const prompt = renderSharedReadPrompt({ ...base, ...on.contract });
    expect(prompt).toContain('[keys="k1,k2,k3"]');
    expect(prompt).toContain("[rel:Subject:relation] Object");
    expect(prompt).toContain("act=<helped|protected|lied|threatened|insulted|gifted|betrayed|confided>");
    expect(prompt).toContain("[m2] Tobin keeps the cellar key in the pantry.");
    expect(prompt.indexOf("[m1]")).toBeGreaterThan(prompt.indexOf("Canon-lite:"));
    expect(prompt.indexOf("[m1]")).toBeLessThan(prompt.indexOf("Quality questions:"));
    const notCapable = readMemoryParts(memory(), window, base.qualities, { capable: false });
    expect(notCapable.contract.readTags?.relations).toBeUndefined();
    const deltasOnly = readMemoryParts(memory(), window, base.qualities, { deltasOnly: true, capable: true });
    expect(deltasOnly.contract).toEqual({ readTags: { acts: true } });
  });
});

describe("v3.0 43 M: runSharedRead resolves aliases to stored ids and screens player acts", () => {
  test("same/update resolve; an unknown alias is a new line with an audit note; a player act needs the player's line", async () => {
    const s = story();
    const engine = new StoryEngine();
    engine.loadStory(s);
    let prompt = "";
    const reply = [
      'DELTA q=rel_mira_player_trust value="down" act=lied evidence="Tobin says you did."',
      'DELTA q=rel_mira_tobin_trust value="up" act=helped evidence="Tobin says you did."',
      'FACT importance=2 update=m2 text="Tobin moved the cellar key to the attic" evidence="I moved the cellar key to the attic."',
      'MEMORY type=fact importance=2 expiration=permanent entity="Mira" same=m1 text="Mira has a dog, Ash." evidence="Ash barked all night."',
      'MEMORY type=detail importance=1 expiration=scene update=m7 text="Letters were mentioned." evidence="I never touched your letters, Mira."',
    ].join("\n");
    const result = await runSharedRead({
      story: s, state: engine.serialize(), priority: 0, reason: "wave-two", window,
      scope: ["rel_mira_player_trust", "rel_mira_tobin_trust"].map((key) => ({ quality: s.qualityByKey[key], key, hints: [] })) as never,
      model: async (text) => { prompt = text; return { text: reply, finish: "stop" }; }, ask: { role: "read", pass: "read" },
      epistemicLedgerCapable: true, readMemory: memory(),
    });
    expect(prompt).toContain("[m2] Tobin keeps the cellar key in the pantry.");
    expect(result.facts[0].neighbour).toEqual({ kind: "update", id: "stored-key" });
    expect(result.memory[0].neighbour).toEqual({ kind: "same", id: "stored-dog" });
    expect(result.memory[1].neighbour).toBeUndefined();
    expect(result.audit.rejected.map((entry) => entry.reason)).toEqual(expect.arrayContaining([NEIGHBOUR_ALIAS_UNKNOWN, ACT_NEEDS_PLAYER_LINE]));
    const acts = Object.fromEntries(result.audit.acceptedDeltas.map((entry) => [entry.delta.q, entry.delta.act ?? null]));
    expect(acts).toEqual({ rel_mira_player_trust: null, rel_mira_tobin_trust: "helped" });
  });
});
