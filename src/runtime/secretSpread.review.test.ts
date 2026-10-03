import { parseStoryV2OrThrow } from "@engine/index";
import { EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_KEY, MEMORY_INJECTION_KEY_PREFIX } from "@constants/defaults";
import type { EpistemicEntry, MemoryEntry } from "@memory/index";
import { MemoryInjector } from "./memoryInjector";
import type { MemoryRuntimeState } from "./types";
import type { InjectorHosts } from "./hostPorts";

const CAST: Array<[string, string]> = [["narrator", "Narrator"], ["aria", "Aria"], ["bram", "Bram"]];
const SECRET = /silver key|vault/i;

const story = parseStoryV2OrThrow({
  format: 2,
  id: "secret-spread",
  title: "Secret Spread",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }, { id: "b", name: "B", objective: "", type: "anchor" }],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: CAST.map(([id, name]) => ({ id, name })),
});

const entry = (id: string, tier: MemoryEntry["tier"], text: string, messageId: number): MemoryEntry => ({
  id, tier, text, messageId, createdAt: messageId, type: tier === "short_term" ? "scene" : "detail", importance: 2, expiration: "session",
  entities: [], confidence: 1, activationTriggers: [], evidence: text, recallCount: 0,
}) as unknown as MemoryEntry;

const ENTRIES: MemoryEntry[] = [
  entry("st", "short_term", "The party made camp beside the river at dusk. Later Kel quietly told Aria he carries a silver key to the old vault and asked her to keep it. At dawn they broke camp and rode north.", 12),
  entry("sd-secret", "session_details", "Kel carries a silver key to the old vault.", 10),
  entry("sd-plain", "session_details", "The river ford is shallow near the willow grove.", 9),
];

const knows = (subject: string, content: string): EpistemicEntry =>
  ({ id: `k-${subject}`, subject, tag: "knows", content, messageId: 10, createdAt: 10 }) as unknown as EpistemicEntry;
const HIDING = { id: "h-kel", subject: "Kel", tag: "hiding", hiddenFrom: "Bram", content: "that he carries a silver key to the old vault", messageId: 10, createdAt: 10 } as unknown as EpistemicEntry;
const SECRET_KNOWLEDGE: EpistemicEntry[] = [HIDING, knows("Aria", "Kel carries a silver key to the old vault")];
const PLAIN_KNOWLEDGE: EpistemicEntry[] = [knows("Aria", "the river ford is shallow near the willow grove")];

function harness(epistemic: EpistemicEntry[], group = true, entries: MemoryEntry[] = ENTRIES) {
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
    epistemic,
    ledger: [],
    arcs: [],
    derived: [],
    pinnedOverflow: 0,
  } as unknown as MemoryRuntimeState;
  const injector = new MemoryInjector({
    getStory: () => story,
    getState: () => ({ boundary: 8, activeCheckpointId: "a", blackboard: { values: {}, versions: {} } }) as never,
    memory: () => memory,
    enabled: () => true,
    capable: () => true,
    ledgerBindings: () => [],
    setPinnedOverflow: () => undefined,
    beatFor: () => "",
    hosts: () => hosts,
  });
  injector.update();
  const tier = (name: string) => blocks.get(`${MEMORY_INJECTION_KEY_PREFIX}${name}`) ?? "";
  const shared = () => [...blocks].filter(([key]) => key.startsWith(MEMORY_INJECTION_KEY_PREFIX) || key === LEDGER_INJECTION_KEY).map(([, value]) => value).join("\n");
  const draft = (name: string) => {
    injector.onMemberDrafted(CAST.findIndex(([, cast]) => cast === name));
    return { shared: shared(), shortTerm: tier("short_term"), details: tier("session_details"), epistemic: blocks.get(EPISTEMIC_INJECTION_KEY) ?? "" };
  };
  const finish = () => { injector.releaseDraft(); injector.update(); return shared(); };
  return { draft, finish, shared, injector };
}

describe("T7-1 secret spread: a secret told to one member stays out of the shared tiers of a member kept from it (payloads.jsonl:102,104)", () => {
  it("Bram, kept from the secret, gets the rolling summary without the sentence that tells it, and no session row carrying it", () => {
    const bram = harness(SECRET_KNOWLEDGE).draft("Bram");
    expect(bram.shared).not.toMatch(SECRET);
    expect(bram.shortTerm).toContain("made camp beside the river");
    expect(bram.shortTerm).toContain("broke camp and rode north");
    expect(bram.details).toContain("river ford is shallow");
  });

  it("Aria, who was told, keeps the whole summary and the session row", () => {
    const aria = harness(SECRET_KNOWLEDGE).draft("Aria");
    expect(aria.shortTerm).toBe(`[Recent events]
${ENTRIES[0].text}`);
    expect(aria.details).toContain("Kel carries a silver key");
  });

  it("the private blocks are unchanged: each is the member's own render, Aria's names the secret and Bram's does not", () => {
    const { draft, injector } = harness(SECRET_KNOWLEDGE);
    const aria = draft("Aria");
    expect(aria.epistemic).toBe(injector.memberPrivateBlock("aria"));
    expect(aria.epistemic).toMatch(SECRET);
    const bram = draft("Bram");
    expect(bram.epistemic).toBe(injector.memberPrivateBlock("bram"));
    expect(bram.epistemic).not.toMatch(SECRET);
  });

  it("after the generation the resting view is restored, and it carries the secret for no one", () => {
    const { draft, finish } = harness(SECRET_KNOWLEDGE);
    expect(draft("Aria").shared).toMatch(SECRET);
    const rest = finish();
    expect(rest).not.toMatch(SECRET);
    expect(rest).toContain("made camp beside the river");
    expect(draft("Aria").shared).toMatch(SECRET);
  });

  it("a summary whose secret spans two sentences is withheld whole rather than half-redacted", () => {
    const spanning = [entry("st", "short_term", "Kel showed Aria a silver key. It opens the old vault.", 12), ENTRIES[2]];
    expect(harness(SECRET_KNOWLEDGE, true, spanning).draft("Bram").shortTerm).toBe("");
    expect(harness(SECRET_KNOWLEDGE, true, spanning).draft("Aria").shortTerm).toMatch(SECRET);
  });

  it("control: with no secret held, every member and the resting prompt get identical shared blocks", () => {
    const { draft, finish, shared } = harness(PLAIN_KNOWLEDGE);
    const rest = shared();
    expect(draft("Aria").shared).toBe(rest);
    expect(draft("Bram").shared).toBe(rest);
    expect(finish()).toBe(rest);
    expect(rest).toMatch(SECRET);
  });

});
