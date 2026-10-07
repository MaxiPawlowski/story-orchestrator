import { join } from "node:path";
import * as recorded from "../fixtures/t2-2-secrets.memory.json";
import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { loadInnerRender, type EpistemicEntry, type MemoryEntry } from "@memory/index";
import { MemoryInjector } from "@runtime/memoryInjector";
import { PacingCoordinator } from "@runtime/coordinators/pacingCoordinator";
import type { InjectorHosts, PromptHost } from "@runtime/hostPorts";
import type { MemoryRuntimeState, TensionRuntimeState } from "@runtime/types";

export const GROUP_PAYLOAD_GOLDEN = join(process.cwd(), "test/goldens/v2.7-03-group-payload.json");

const CAST: Array<[string, string]> = [
  ["dm", "Adolion Narrator"], ["sister", "Natalia"], ["maid", "Shiya"], ["knight", "Ronan"], ["father", "Javon"], ["brother", "Welden"], ["heir_maid", "Leila"],
];

const story = parseStoryV2OrThrow({
  format: 2,
  id: "v27-03-payload",
  title: "Payload",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    {
      id: "a", name: "A", objective: "Reach the gate.", type: "anchor", start: true,
      guidance: { all: "The bells ring at dusk.", members: { sister: "You hid the letter.", knight: "You owe the captain." } },
      motives: { sister: "find the letter before Ronan does" },
    },
    { id: "b", name: "B", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: CAST.map(([id, name]) => ({ id, name, ...(id === "dm" ? { view: "omniscient" } : {}), ...(id === "knight" ? { drive: "earn back his name" } : {}) })),
});

const entries = recorded.entries.map((entry) => ({
  type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: entry.text, recallCount: 0, ...entry,
}) as unknown as MemoryEntry);

function scriptedGroupTurn() {
  const blocks = new Map<string, string>();
  const prompt = {
    setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); },
    clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); },
  } as unknown as PromptHost;
  const hosts = {
    prompt,
    roster: {
      getActiveGroup: () => ({ id: "g", members: CAST.map(([, name]) => `${name}.png`), disabled_members: ["Leila.png"] }),
      resolveGroupMemberId: (name: string) => `${name}.png`,
      chatRows: () => [{ name: "Natalia", mes: "The letter is gone.", is_user: false }, { name: "You", mes: "Where is it?", is_user: true }],
      systemUserName: "SillyTavern System",
    },
    chat: { chatRows: () => [], lastMessageText: () => "", chatWindow: () => ({ messages: [] }) },
    injection: { getCharacterNameById: (index: number) => CAST[index]?.[1], readInjectedPromptBlocks: () => [] },
  } as unknown as InjectorHosts;
  const budgets = { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 };
  const memory = {
    settings: { enabled: true, epistemicLedgerCapable: true, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: budgets },
    entries,
    epistemic: recorded.epistemic as unknown as EpistemicEntry[],
    ledger: [],
    arcs: [],
    derived: [],
    pinnedOverflow: 0,
  } as unknown as MemoryRuntimeState;
  const state = { boundary: 26, activeCheckpointId: "a", blackboard: { values: {}, versions: {} } } as unknown as EngineState;
  const injector = new MemoryInjector({
    getStory: () => story, getState: () => state, memory: () => memory, enabled: () => true, capable: () => true, ledgerBindings: () => [],
    setPinnedOverflow: () => undefined, beatFor: (id) => (id === "knight" ? "press the captain about the debt" : ""), hosts: () => hosts,
  });
  let tension: TensionRuntimeState = { levels: [], smoothed: null, history: [] };
  const pacing = new PacingCoordinator({
    getStory: () => story, getState: () => state, getStateLog: () => [], getTensionTarget: () => undefined, getTension: () => tension,
    setTension: (next) => { tension = next; }, getPacing: () => ({ alpha: 0.5, shapeOverride: null, hintEnabled: false }), hosts: { prompt },
  });
  const capture = () => Object.fromEntries([...blocks].sort(([left], [right]) => left.localeCompare(right)));
  const index = (name: string) => CAST.findIndex(([, cast]) => cast === name);
  const steps: Record<string, Record<string, string>> = {};
  injector.update();
  pacing.updateSteering();
  steps.resting = capture();
  injector.onMemberDrafted(index("Natalia"));
  pacing.draftGuidance("sister");
  steps.draftedNatalia = capture();
  injector.withholdPrivateKnowledge();
  pacing.withholdGuidance();
  steps.withheldQuiet = capture();
  injector.releaseWithhold();
  pacing.releaseStaleGuidanceHold();
  injector.onMemberDrafted(index("Ronan"));
  pacing.draftGuidance("knight");
  steps.draftedRonan = capture();
  injector.onMemberDrafted(index("Adolion Narrator"));
  pacing.draftGuidance("dm");
  steps.draftedNarrator = capture();
  injector.releaseDraft();
  pacing.releaseDraftGuidance();
  injector.update();
  pacing.updateSteering();
  steps.restingAgain = capture();
  return steps;
}

export async function groupPayloadSteps(): Promise<Record<string, Record<string, string>>> {
  await loadInnerRender();
  return scriptedGroupTurn();
}
