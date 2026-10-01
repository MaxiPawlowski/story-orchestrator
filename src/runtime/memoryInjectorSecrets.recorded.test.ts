import * as recorded from "../../test/fixtures/t2-2-secrets.memory.json";
import { parseStoryV2OrThrow } from "@engine/index";
import { LEDGER_INJECTION_KEY, MEMORY_INJECTION_KEY_PREFIX } from "@constants/defaults";
import type { EpistemicEntry, MemoryEntry } from "@memory/index";
import { MemoryInjector } from "./memoryInjector";
import type { MemoryRuntimeState } from "./types";
import type { InjectorHosts } from "./hostPorts";

const CAST: Array<[string, string]> = [
  ["dm", "Adolion Narrator"], ["sister", "Natalia"], ["maid", "Shiya"], ["knight", "Ronan"], ["father", "Javon"], ["brother", "Welden"], ["heir_maid", "Leila"],
];
const SEALS = /seals? (?:beneath|under)[^.]*(?:failing|weakening)|seals? (?:are|were) failing|failing seals/i;
const WELL = /poisoned (?:old )?well|old well[^.]*poisoned/i;

const story = parseStoryV2OrThrow({
  format: 2,
  id: "t2-2-secrets",
  title: "Secrets",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }, { id: "b", name: "B", objective: "", type: "anchor" }],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: CAST.map(([id, name]) => ({ id, name })),
});

const entries = recorded.entries.map((entry) => ({
  type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: entry.text, recallCount: 0, ...entry,
}) as unknown as MemoryEntry);

const firstPerField = (row: { entity: string; field: string }, index: number, rows: Array<{ entity: string; field: string }>) =>
  rows.findIndex((other) => other.entity === row.entity && other.field === row.field) === index;
const ledger = recorded.ledger.filter((row) => !row.bound).filter(firstPerField).map((row, index) => ({
  id: `l${index}`, entity: row.entity, entityType: "character", field: row.field, value: row.value, createdAt: 26,
  provenance: { source: "extractor", messageId: 35, boundary: 26, pass: "ledger", validity: "live" },
}));

function harness(group: boolean, before = Infinity) {
  const blocks = new Map<string, string>();
  const hosts = {
    prompt: {
      setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); },
      clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); },
    },
    roster: {
      getActiveGroup: () => (group ? { id: "g", members: [], disabled_members: [] } : null),
      resolveGroupMemberId: (name: string) => `${name}.png`,
      chatRows: () => [],
      systemUserName: "SillyTavern System",
    },
    chat: { chatRows: () => [], lastMessageText: () => "", chatWindow: () => ({ messages: [] }) },
    injection: { getCharacterNameById: (index: number) => CAST[index]?.[1], readInjectedPromptBlocks: () => [] },
  } as unknown as InjectorHosts;
  const budgets = { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 };
  const memory = {
    settings: { enabled: true, epistemicLedgerCapable: true, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: budgets },
    entries,
    epistemic: (recorded.epistemic as unknown as EpistemicEntry[]).filter((entry) => (entry.messageId ?? 0) < before),
    ledger,
    arcs: [],
    derived: [],
    pinnedOverflow: 0,
  } as unknown as MemoryRuntimeState;
  const injector = new MemoryInjector({
    getStory: () => story,
    getState: () => ({ boundary: 26, activeCheckpointId: "a", blackboard: { values: {}, versions: {} } }) as never,
    memory: () => memory,
    enabled: () => true,
    capable: () => true,
    ledgerBindings: () => [],
    setPinnedOverflow: () => undefined,
    beatFor: () => "",
    hosts: () => hosts,
  });
  injector.update();
  const shared = () => [...blocks].filter(([key]) => key.startsWith(MEMORY_INJECTION_KEY_PREFIX) || key === LEDGER_INJECTION_KEY).map(([, value]) => value).join("\n");
  const draft = (name: string) => { injector.onMemberDrafted(CAST.findIndex(([, cast]) => cast === name)); return shared(); };
  return { shared, draft, injector };
}

describe("T2-2: a held secret stays out of the shared tiers of every member it is kept from (payloads.jsonl:235/238/243/254)", () => {
  it("control: the recorded memory restates both secrets, and a solo chat (one narrator voices everyone) still carries them", () => {
    expect(entries.filter((entry) => SEALS.test(entry.text)).length).toBeGreaterThan(5);
    expect(entries.filter((entry) => WELL.test(entry.text)).length).toBeGreaterThan(5);
    const solo = harness(false).shared();
    expect(solo).toMatch(SEALS);
    expect(solo).toMatch(WELL);
  });

  it("Ronan and Welden, told neither, are drafted without the failing seals or the poisoned well (Welden on what the store held before his msg-41 draft)", () => {
    for (const [name, before] of [["Ronan", Infinity], ["Welden", 41]] as const) {
      const prompt = harness(true, before).draft(name);
      expect({ name, seals: SEALS.test(prompt), well: WELL.test(prompt) }).toEqual({ name, seals: false, well: false });
    }
  });

  it("Natalia, whom Max hides the seals from, never gets them; the well story he told her she keeps", () => {
    const prompt = harness(true).draft("Natalia");
    expect(prompt).not.toMatch(SEALS);
    expect(prompt).toMatch(WELL);
    expect(prompt).toContain("active_goal=warn others about the poisoned old well");
  });

  it("Shiya keeps the seals she was told and loses the well Max hides from her, ledger goal included", () => {
    const prompt = harness(true).draft("Shiya");
    expect(prompt).toMatch(SEALS);
    expect(prompt).not.toMatch(WELL);
    expect(prompt).not.toContain("warn others about the poisoned old well");
  });

  it("the resting prompt and an unknown draft carry neither secret, and the fate says why", () => {
    const { shared, draft, injector } = harness(true);
    expect(shared()).not.toMatch(SEALS);
    expect(shared()).not.toMatch(WELL);
    expect(draft("Nobody")).not.toMatch(SEALS);
    expect(Object.values(injector.readModels().memoryInjection?.fates ?? {})).toContain("private");
  });

  it("a quiet or impersonate generation after a draft goes back to the resting view", () => {
    const { draft, shared, injector } = harness(true);
    expect(draft("Shiya")).toMatch(SEALS);
    injector.withholdPrivateKnowledge();
    expect(shared()).not.toMatch(SEALS);
  });
});
