jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: jest.fn(() => ({ chat: [] })),
}));

import { parseStoryV2OrThrow } from "@engine/index";
import {
  capEpistemic, EPISTEMIC_CAP, EPISTEMIC_SECRET_CEILING, EPISTEMIC_SUBJECT_CAP, heldSecrets, withoutSecretLines,
  type EpistemicEntry, type MemoryEntry, type ParsedEpistemicSignal,
} from "@memory/index";
import { foldEpistemic, leavingCast } from "@memory/chapterFold";
import { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";

const CAST: Array<[string, string]> = [["narrator", "Narrator"], ["aria", "Aria"], ["bram", "Bram"], ["kel", "Kel"]];
const NAMES = CAST.map(([, name]) => name);
const SECRET = /silver key|vault/i;

const story = parseStoryV2OrThrow({
  format: 2,
  id: "secret-cap",
  title: "Secret Cap",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }, { id: "b", name: "B", objective: "", type: "anchor" }],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: CAST.map(([id, name]) => ({ id, name })),
});

const row = (id: string, text: string): MemoryEntry => ({
  id, tier: "facts", text, messageId: 10, createdAt: 10, type: "relationship", importance: 2, expiration: "permanent",
  entities: ["Kel"], confidence: 1, activationTriggers: [], evidence: text, recallCount: 0,
}) as unknown as MemoryEntry;

const HIDING = { id: "h-kel", subject: "Kel", tag: "hiding", hiddenFrom: "Bram", content: "that he carries a silver key to the old vault", messageId: 10, createdAt: 1 } as unknown as EpistemicEntry;
const ENTRIES: MemoryEntry[] = [
  row("whole", "Kel carries a silver key to the old vault."),
  row("mixed", "Kel trusts Aria with his life. Kel carries a silver key to the old vault."),
  row("plain", "Kel and Bram fought side by side at the ford."),
];
const SHARED = ENTRIES.map((entry) => entry.text).join("\n");

const PLACES = [
  "miller hoards barley", "harbor chains rusted", "orchard pears ripen early", "quarry flooded overnight", "chapel candles vanished",
  "bridge tolls doubled", "tanner limps badly", "forge bellows tore", "granary rats multiplied", "kennel hounds escaped",
  "brewer waters ale", "watchtower beacon failed", "stable mare foaled", "market prices climbed", "dockyard crane collapsed",
];
const kelKnows = (count: number): ParsedEpistemicSignal[] =>
  PLACES.slice(0, count).map((place) => ({ tag: "knows", subject: "Kel", content: `the ${place}` }));
const knowsRows = (count: number, from = 2): EpistemicEntry[] =>
  PLACES.slice(0, count).map((place, index) => ({ id: `k-${place}`, subject: "Kel", tag: "knows", content: `the ${place}`, messageId: 11, createdAt: from + index }) as unknown as EpistemicEntry);

function mirrorBook() {
  const book = new Map<string, { content: string; disable: boolean }>();
  let created = false;
  const host = {
    ensureLorebook: async (name: string) => { const first = !created; created = true; return { name, created: first }; },
    loadLorebook: async () => ({ entries: Object.fromEntries([...book].map(([comment, entry], uid) => [uid, { uid, comment, content: entry.content, disable: entry.disable }])) }),
    upsertWIEntry: async (_book: string, comment: string, content: string) => { const had = book.has(comment); book.set(comment, { content, disable: false }); return had ? "updated" : "created"; },
    disableWIEntry: async (_book: string, comments: string | string[]) => { [comments].flat().forEach((comment) => { const entry = book.get(comment); if (entry) entry.disable = true; }); return { ok: true, changed: true }; },
    bindChatLorebook: () => "bound",
    currentChatOwner: () => null,
  };
  const live = () => [...book].filter(([comment, entry]) => comment.startsWith("so_") && !entry.disable).map(([, entry]) => entry.content).join("\n");
  return { host, live };
}

function coordinatorHarness(epistemic: EpistemicEntry[]) {
  const context: RunContext = { chatId: "chat-a", storyId: "secret-cap", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const mirror = mirrorBook();
  const notes: string[] = [];
  const hosts = {
    prompt: { setStoryExtensionPrompt: () => undefined, clearStoryExtensionPrompt: () => undefined },
    roster: { getActiveGroup: () => ({ id: "g", members: [], disabled_members: [] }), resolveGroupMemberId: (name: string) => `${name}.png`, chatRows: () => [], systemUserName: "SillyTavern System" },
    chat: { chatRows: () => [], lastMessageText: () => "", chatWindow: () => ({ messages: [] }), chatId: () => "chat-a" },
    injection: { getCharacterNameById: (index: number) => CAST[index]?.[1], readInjectedPromptBlocks: () => [] },
    mirror: mirror.host,
  };
  let memory = {
    settings: { enabled: true, epistemicLedgerCapable: true, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 } },
    entries: ENTRIES, epistemic, ledger: [], arcs: [], derived: [], conflicts: [], resolvedConflicts: [], pinnedOverflow: 0, wiWrites: {}, wiBook: null,
  } as Record<string, unknown>;
  const coordinator = new MemoryCoordinator({
    hosts,
    getStory: () => story,
    getState: () => ({ boundary: 8, lastMessageId: 12, activeCheckpointId: "a", visitedPath: ["a"], blackboard: { values: {}, versions: {}, latched: {} } }),
    getMemory: () => memory,
    setMemory: (next: typeof memory) => { memory = next; },
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => undefined,
    enqueueMechanical: () => undefined,
    ownership,
    judge: () => null,
    persist: async () => undefined,
    notify: () => undefined,
    authorNote: (summary: string, note: string) => { notes.push(`${summary} | ${note}`); },
  } as never);
  return { coordinator, mirror, notes, epistemic: () => memory.epistemic as EpistemicEntry[] };
}

const kept = (entries: EpistemicEntry[], member: string[] | null) => withoutSecretLines(SHARED, heldSecrets(entries, NAMES), member);

describe("X11: the epistemic cap never evicts a row that keeps a secret", () => {
  it("13 [knows] rows after a [hiding] row: the hiding row survives the cap and the subject still holds at most the cap", () => {
    const capped = capEpistemic([HIDING, ...knowsRows(13)]);
    expect(capped.map((entry) => entry.id)).toContain("h-kel");
    expect(capped.filter((entry) => entry.subject === "Kel")).toHaveLength(EPISTEMIC_SUBJECT_CAP);
    expect(capped.map((entry) => entry.id)).toEqual(["h-kel", ...knowsRows(13).slice(2).map((entry) => entry.id)]);
  });

  it("a kept-out member's shared text still loses the secret after the cap; the hider keeps it", () => {
    const capped = capEpistemic([HIDING, ...knowsRows(13)]);
    expect(kept(capped, ["bram"])).not.toMatch(SECRET);
    expect(kept(capped, null)).not.toMatch(SECRET);
    expect(kept(capped, ["bram"])).toContain("Kel and Bram fought side by side at the ford.");
    expect(kept(capped, ["kel"])).toMatch(SECRET);
  });

  it("negative control: the store without its hiding row (what the old cap left) hands the secret to a kept-out member", () => {
    const evicted = capEpistemic([HIDING, ...knowsRows(13)]).filter((entry) => entry.id !== "h-kel");
    expect(kept(evicted, ["bram"])).toMatch(SECRET);
  });

  it("[unaware] rows are reserved the same way", () => {
    const unaware = { ...HIDING, id: "u-kel", tag: "unaware", hiddenFrom: undefined } as unknown as EpistemicEntry;
    expect(capEpistemic([unaware, ...knowsRows(13)]).map((entry) => entry.id)).toContain("u-kel");
  });

  it("a superseded secret row is no longer reserved: it competes in the retired pass", () => {
    const retired = { ...HIDING, supersededBy: "retired@3" } as unknown as EpistemicEntry;
    const retiredKnows = knowsRows(13).map((entry) => ({ ...entry, supersededBy: "retired@4" }));
    expect(capEpistemic([retired, ...retiredKnows]).map((entry) => entry.id)).not.toContain("h-kel");
  });

  it("the coordinator path: 13 [knows] signals keep the hiding row, the injection's resting view and the mirror stay without the secret", async () => {
    const { coordinator, mirror, epistemic } = coordinatorHarness([HIDING]);
    await coordinator.syncWorldInfo();
    expect(mirror.live()).not.toMatch(SECRET);
    coordinator.applyEpistemic(kelKnows(13), 12);
    await coordinator.mirror.settled();
    expect(epistemic().map((entry) => entry.id)).toContain("h-kel");
    expect(epistemic().filter((entry) => entry.subject === "Kel")).toHaveLength(EPISTEMIC_SUBJECT_CAP);
    expect(coordinator.injector.restingEntries(ENTRIES).map((entry) => entry.text).join("\n")).not.toMatch(SECRET);
    expect(mirror.live()).not.toMatch(SECRET);
    expect(mirror.live()).toContain("Kel and Bram fought side by side at the ford.");
  });
});

describe("X11: the cap stays bounded when secrets alone pass the ceiling", () => {
  const secretRows = (count: number): EpistemicEntry[] => Array.from({ length: count }, (_, index) => ({
    id: `s-${index}`, subject: `Keeper ${index % 5}`, tag: index % 2 ? "unaware" : "hiding", hiddenFrom: "Bram", content: `secret number ${index} about the reeve`, messageId: 1, createdAt: index,
  }) as unknown as EpistemicEntry);

  it("every secret row is kept; other rows fill only what the caps leave", () => {
    const secrets = secretRows(EPISTEMIC_CAP + 10);
    const capped = capEpistemic([...secrets, ...knowsRows(15, 500)]);
    expect(capped.filter((entry) => entry.id.startsWith("s-"))).toHaveLength(EPISTEMIC_CAP + 10);
    expect(capped.filter((entry) => entry.tag === "knows")).toHaveLength(0);
    expect(capped).toHaveLength(EPISTEMIC_CAP + 10);
  });

  it("under the cap the total is still bounded by the cap: secrets take their slots first", () => {
    const secrets = secretRows(20);
    const others = Array.from({ length: 200 }, (_, index) => ({ id: `o-${index}`, subject: `Char ${index % 40}`, tag: "knows", content: `fact ${index}`, createdAt: 100 + index }) as unknown as EpistemicEntry);
    const capped = capEpistemic([...secrets, ...others]);
    expect(capped).toHaveLength(EPISTEMIC_CAP);
    expect(capped.filter((entry) => entry.id.startsWith("s-"))).toHaveLength(20);
  });

  it("the coordinator keeps them all and leaves one quiet author note when the ceiling is crossed, not on every pass", () => {
    const { coordinator, notes, epistemic } = coordinatorHarness(secretRows(EPISTEMIC_SECRET_CEILING));
    expect(notes).toEqual([]);
    coordinator.applyEpistemic([{ tag: "hiding", subject: "Aria", hiddenFrom: "Bram", content: "that the abbey ledger was forged" }], 12);
    expect(epistemic().filter((entry) => entry.tag !== "knows")).toHaveLength(EPISTEMIC_SECRET_CEILING + 1);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain(`${EPISTEMIC_SECRET_CEILING + 1} secret rows`);
    coordinator.applyEpistemic([{ tag: "unaware", subject: "Bram", content: "that the abbey bell was cracked on purpose" }], 13);
    expect(epistemic().filter((entry) => entry.tag !== "knows")).toHaveLength(EPISTEMIC_SECRET_CEILING + 2);
    expect(notes).toHaveLength(1);
  });
});

describe("X11: a chapter fold retires a [hiding] row from the private block, not from secret protection", () => {
  it("hider and target leave: the folded row still keeps the secret from the members who stay", () => {
    const leaving = leavingCast(["kel", "bram"], CAST.map(([id, name]) => ({ id, name })));
    const { epistemic, folded } = foldEpistemic([HIDING], "ch#1", leaving, NAMES);
    expect(folded).toEqual(["h-kel"]);
    expect(kept(epistemic, ["aria"])).not.toMatch(SECRET);
    expect(kept(epistemic, null)).not.toMatch(SECRET);
  });

  it("control: with no secret row at all the shared text is verbatim", () => {
    expect(kept([], ["aria"])).toBe(SHARED);
  });
});
