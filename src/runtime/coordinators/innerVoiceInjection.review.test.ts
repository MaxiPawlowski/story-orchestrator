import { fakeHosts } from "../../../test/support/fakeHosts";
import { plantedModel } from "../../../test/support/modelCall";
import { EPISTEMIC_INJECTION_KEY } from "@constants/defaults";
import type { InnerBeat } from "@memory/index";
import { NARRATOR_HEADER, NARRATOR_NAMED_FIRST, NARRATOR_SELF_VOICED } from "@memory/innerRender";
import { loadInnerRender } from "@memory/index";
import { MemoryCoordinator } from "./memoryCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";

const prompts = new Map<string, string>();

beforeAll(async () => { await loadInnerRender(); });
const MEMBERS = ["Arin", "Ponticius", "DM Narrator"];

interface Setup {
  group?: boolean;
  capable?: boolean;
  roster?: Array<{ id: string; name: string; drive?: string; view?: "omniscient" }>;
  chat?: Array<{ name: string; mes: string; is_user?: boolean }>;
  beats?: InnerBeat[];
  boundary?: number;
  motives?: boolean;
  disabled?: string[];
}

const DEFAULT_ROSTER = [
  { id: "arin", name: "Arin", drive: "win back her father's sword" },
  { id: "ponticius", name: "Ponticius", drive: "keep the guild solvent" },
  { id: "narrator", name: "DM Narrator", view: "omniscient" as const },
];

const DEFAULT_CHAT = [
  { name: "Arin", mes: "I will take the sword back from the vault tonight, whatever it costs. A bribed guard, a burned ledger, then I leave town at dawn." },
  { name: "Max", mes: "I nod.", is_user: true },
];

function harness(setup: Setup = {}) {
  prompts.clear();
  const chat = setup.chat ?? DEFAULT_CHAT;
  const stapi = {
    settingsAreLoaded: () => true,
    getContext: () => ({ chat, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
    getActiveGroup: () => (setup.group === false ? null : { members: ["arin.png", "ponticius.png", "dm narrator.png"], disabled_members: setup.disabled ?? [] }),
    resolveGroupMemberId: (name: string) => `${name.toLowerCase()}.png`,
    hostSystemUserName: "SillyTavern System",
    getCharacterNameById: (id: number) => MEMBERS[id],
    countTokens: () => 4,
    readInjectedPromptBlocks: () => [...prompts].map(([key, value]) => ({ key, value })),
    setStoryExtensionPrompt: (key: string, text: string) => { prompts.set(key, text); },
    clearStoryExtensionPrompt: (key: string) => { prompts.delete(key); },
  };
  const story = {
    title: "S",
    id: "s1",
    checkpointById: { cp1: { id: "cp1", name: "CP1", objective: "", ...(setup.motives === false ? {} : { motives: { arin: "get Ponticius to sign the vault pass", nobody: "x" } }) } },
    qualityByKey: {},
    roster: setup.roster ?? DEFAULT_ROSTER,
    requirements: { personas: ["Max"] },
    arc_bridges: [],
  };
  const current: RunContext = { chatId: "chat-a", storyId: "s1", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let memoryState = {
    settings: { enabled: true, epistemicLedgerCapable: setup.capable !== false, tierTokenBudgets: { facts: 400, session: 400, short_term: 400, scene_history: 400 } },
    entries: [], conflicts: [], resolvedConflicts: [], writeLog: [], excluded: [], verifyDrops: [], derived: [] as Array<{ kind: string; messageId: number }>,
    sceneCount: 0, shortTermSummaryEnd: 0, arcs: [], epistemic: [], ledger: [], canon: null, updatedAt: "", innerBeats: setup.beats,
  };
  const beatFor = jest.fn((rosterId: string) => setup.beats?.find((beat) => beat.memberId === rosterId)?.beat ?? "");
  let boundary = setup.boundary ?? 3;
  const coordinator = new MemoryCoordinator({ hosts: fakeHosts(stapi),
    getStory: () => story,
    getState: () => ({ activeCheckpointId: "cp1", boundary, lastMessageId: 1, blackboard: { values: {}, versions: {} } }),
    getMemory: () => memoryState,
    setMemory: (next: typeof memoryState) => { memoryState = next; },
    model: plantedModel,
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    enqueueMechanical: () => {},
    ownership,
    judge: () => null,
    persist: async () => {},
    notify: () => {},
    beatFor,
  } as never);
  return { coordinator, beatFor, memory: () => memoryState, scene: (messageId: number) => { memoryState = { ...memoryState, derived: [...memoryState.derived, { kind: "scene_summary", messageId }] }; }, advance: (to: number) => { boundary = to; } };
}

const block = () => prompts.get(EPISTEMIC_INJECTION_KEY) ?? "";

describe("authored drive and motive (v2.6 plan 06 A)", () => {
  it("reach the drafted member only, and the group resting block stays empty", () => {
    const { coordinator } = harness();
    coordinator.updateInjection();
    expect(block()).toBe("");
    coordinator.onMemberDrafted(0);
    expect(block()).toContain("- What you want: win back her father's sword");
    expect(block()).toContain("- Right now: get Ponticius to sign the vault pass");
    coordinator.onMemberDrafted(1);
    expect(block()).toContain("- What you want: keep the guild solvent");
    expect(block()).not.toContain("father's sword");
    expect(block()).not.toContain("vault pass");
  });

  it("are injected even when the epistemic capability is off, and never carry knowledge then", () => {
    const { coordinator } = harness({ capable: false });
    coordinator.applyEpistemic([{ tag: "knows", subject: "Arin", content: "the vault key is fake" }], 1);
    coordinator.onMemberDrafted(0);
    expect(block()).toContain("win back her father's sword");
    expect(block()).not.toContain("vault key is fake");
  });

  it("a story without any inner voice keeps today's block exactly (control)", () => {
    const { coordinator } = harness({ capable: false, motives: false, roster: [{ id: "arin", name: "Arin" }, { id: "ponticius", name: "Ponticius" }] });
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(prompts.has(EPISTEMIC_INJECTION_KEY)).toBe(false);
  });
});

describe("intends (v2.6 plan 06 B)", () => {
  it("records an intent the character states in its own words, and injects it for that member only", () => {
    const { coordinator } = harness();
    coordinator.applyEpistemic([{ tag: "intends", subject: "Arin", content: "take the sword from the vault tonight" }], 1, [], { from: 0, to: 1 });
    coordinator.onMemberDrafted(0);
    expect(block()).toContain("- You intend: take the sword from the vault tonight");
    coordinator.onMemberDrafted(1);
    expect(block()).not.toContain("take the sword");
  });

  it("drops an intent attributed to the player persona, one with no evidence in a character's own lines, and meta-commentary", () => {
    const { coordinator, memory } = harness();
    coordinator.applyEpistemic([
      { tag: "intends", subject: "Max", content: "rob the vault" },
      { tag: "intends", subject: "Ponticius", content: "raise the toll" },
      { tag: "intends", subject: "Arin", content: "I should write a longer reply for the user" },
    ], 1, [], { from: 0, to: 1 });
    expect(memory().epistemic).toEqual([]);
  });

  it("an intent read without its window is never stored (evidence cannot be checked)", () => {
    const { coordinator, memory } = harness();
    coordinator.applyEpistemic([{ tag: "intends", subject: "Arin", content: "take the sword" }], 1);
    expect(memory().epistemic).toEqual([]);
  });

  it("keeps the three newest open intents per member", () => {
    const { coordinator, memory } = harness();
    const aims = ["steal the sword", "bribe a guard", "burn the ledger", "leave town at dawn"];
    aims.forEach((aim, index) => coordinator.applyEpistemic([{ tag: "intends", subject: "Arin", content: aim }], index, [], { from: 0, to: 1 }));
    expect(memory().epistemic.map((entry: { content: string }) => entry.content)).toEqual(aims.slice(1));
  });

  it("lapses after three scene breaks without a restatement, and a restatement renews it", () => {
    const { coordinator, scene } = harness();
    coordinator.applyEpistemic([{ tag: "intends", subject: "Arin", content: "take the sword from the vault tonight" }], 1, [], { from: 0, to: 1 });
    scene(2); scene(3);
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(block()).toContain("take the sword");
    coordinator.applyEpistemic([{ tag: "intends", subject: "Arin", content: "take the sword from the vault tonight" }], 4, [], { from: 0, to: 1 });
    scene(5); scene(6);
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(block()).toContain("take the sword");
    scene(7);
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(block()).not.toContain("take the sword");
  });

  it("lapses after K boundaries without a scene break (a long group stretch)", () => {
    const { coordinator, advance } = harness();
    coordinator.applyEpistemic([{ tag: "intends", subject: "Arin", content: "take the sword from the vault tonight" }], 1, [], { from: 0, to: 1 });
    advance(3 + 23);
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(block()).toContain("take the sword");
    advance(3 + 24);
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(block()).not.toContain("take the sword");
  });
});

describe("the inner beat at draft time (v2.6 plan 06 C)", () => {
  const beat: InnerBeat = { chatId: "chat-a", memberId: "arin", basedOnMessageId: 0, checkpointId: "cp1", beat: "Stall Ponticius until the guard changes", at: "t" };

  it("is added to the drafted member's block only, and asked for exactly that member", () => {
    const { coordinator, beatFor } = harness({ beats: [beat] });
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    expect(beatFor).toHaveBeenLastCalledWith("arin");
    expect(block()).toContain("- Your intent this turn: Stall Ponticius until the guard changes");
    coordinator.onMemberDrafted(1);
    expect(block()).not.toContain("Stall Ponticius");
  });

  it("T3-3: a beat that restates a secret held from the drafted member is dropped at draft, the concealer's own is kept", () => {
    const told: InnerBeat = { chatId: "chat-a", memberId: "ponticius", basedOnMessageId: 0, checkpointId: "cp1", beat: "Ask Arin outright whether she already has the vault key", at: "t" };
    const own: InnerBeat = { ...told, memberId: "arin", beat: "Keep the vault key out of sight until Ponticius signs" };
    const steer: InnerBeat = { ...told, memberId: "narrator", beat: "Let the guard notice that Arin already has the vault key" };
    const { coordinator } = harness({ beats: [told, own, steer] });
    coordinator.applyEpistemic([{ tag: "hiding", subject: "Arin", hiddenFrom: "Ponticius", content: "she already has the vault key" }], 1, [], { from: 0, to: 1 });
    coordinator.onMemberDrafted(1);
    expect(block()).not.toContain("vault key");
    coordinator.onMemberDrafted(2);
    expect(block()).not.toContain("Let the guard notice");
    coordinator.onMemberDrafted(0);
    expect(block()).toContain("- Your intent this turn: Keep the vault key out of sight until Ponticius signs");
  });

  it("control: with no secret held, the same beat reaches its member", () => {
    const told: InnerBeat = { chatId: "chat-a", memberId: "ponticius", basedOnMessageId: 0, checkpointId: "cp1", beat: "Ask Arin outright whether she already has the vault key", at: "t" };
    const { coordinator } = harness({ beats: [told] });
    coordinator.updateInjection();
    coordinator.onMemberDrafted(1);
    expect(block()).toContain("- Your intent this turn: Ask Arin outright whether she already has the vault key");
  });

  it("survives a mid-draft refresh", () => {
    const { coordinator } = harness({ beats: [beat] });
    coordinator.updateInjection();
    coordinator.onMemberDrafted(0);
    coordinator.updateInjection();
    expect(block()).toContain("Stall Ponticius");
  });
});

describe("narrator view (v2.6 plan 06 D, block-scoped privacy)", () => {
  it("an omniscient member's block carries the others' private rows under the concealment header; no other member's does", () => {
    const { coordinator } = harness();
    coordinator.applyEpistemic([
      { tag: "hiding", subject: "Arin", hiddenFrom: "Ponticius", content: "she already has the vault key" },
      { tag: "intends", subject: "Arin", content: "take the sword from the vault tonight" },
      { tag: "suspects", subject: "Ponticius", content: "someone copied his key" },
    ], 1, [], { from: 0, to: 1 });
    coordinator.onMemberDrafted(2);
    expect(block()).toContain(NARRATOR_HEADER);
    expect(block()).toContain("- Arin is concealing from Ponticius: she already has the vault key");
    expect(block()).toContain("- Arin intends: take the sword from the vault tonight");
    expect(block()).toContain("- Arin wants: win back her father's sword");
    expect(block()).not.toContain("someone copied his key");
    coordinator.onMemberDrafted(1);
    expect(block()).not.toContain(NARRATOR_HEADER);
    expect(block()).not.toContain("vault key");
    expect(block()).toContain("- You suspect: someone copied his key");
    coordinator.onMemberDrafted(0);
    expect(block()).not.toContain("copied his key");
  });

  it("T1-2: the narrator is told which enabled members voice themselves, and to use a named character before inventing one (msgs 22, 28)", () => {
    const { coordinator } = harness({ disabled: ["ponticius.png"] });
    coordinator.updateInjection();
    coordinator.onMemberDrafted(2);
    expect(block()).toContain(`${NARRATOR_SELF_VOICED} Arin.`);
    expect(block()).toContain(NARRATOR_NAMED_FIRST);
    coordinator.onMemberDrafted(0);
    expect(block()).not.toContain(NARRATOR_SELF_VOICED);
  });
});
