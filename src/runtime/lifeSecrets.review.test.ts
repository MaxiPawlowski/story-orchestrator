import { readFileSync } from "fs";
import { join } from "path";
import { agendaStepKey, parseStoryV2OrThrow } from "@engine/index";
import { EPISTEMIC_INJECTION_KEY } from "@constants/defaults";
import type { EpistemicEntry } from "@memory/index";
import { MemoryInjector } from "./memoryInjector";
import type { MemoryRuntimeState } from "./types";
import type { InjectorHosts } from "./hostPorts";

const STORY = parseStoryV2OrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")));
const CAST = ["Arin", "DM Narrator"];
const VALUES = { rel_arin_player_trust: 2, [agendaStepKey("arin", "debt")]: 2 };

const hiding = (): EpistemicEntry => ({
  id: "e1", subject: "Arin", tag: "hiding", hiddenFrom: "DM Narrator", content: "she met the smuggler at the docks at night", createdAt: 1, messageId: 1,
  provenance: { source: "extractor", messageId: 1, boundary: 1, pass: "epistemic", validity: "live" },
} as unknown as EpistemicEntry);

function harness(epistemic: EpistemicEntry[], capable = true) {
  const blocks = new Map<string, string>();
  const hosts = {
    prompt: {
      setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); },
      clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); },
    },
    roster: { getActiveGroup: () => ({ id: "g", members: [], disabled_members: [] }), resolveGroupMemberId: (name: string) => `${name}.png`, chatRows: () => [], systemUserName: "SillyTavern System" },
    chat: { chatRows: () => [], lastMessageText: () => "", chatWindow: () => ({ messages: [] }) },
    injection: { getCharacterNameById: (index: number) => CAST[index], readInjectedPromptBlocks: () => [] },
  } as unknown as InjectorHosts;
  const budgets = { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 };
  const memory = {
    settings: { enabled: true, epistemicLedgerCapable: capable, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: budgets },
    entries: [], epistemic, ledger: [], arcs: [], derived: [], pinnedOverflow: 0,
  } as unknown as MemoryRuntimeState;
  const injector = new MemoryInjector({
    getStory: () => STORY,
    getState: () => ({ boundary: 5, activeCheckpointId: "start", blackboard: { values: VALUES, versions: {} } }) as never,
    memory: () => memory, enabled: () => true, capable: () => capable, ledgerBindings: () => [], setPinnedOverflow: () => undefined, beatFor: () => "", hosts: () => hosts,
  });
  injector.update();
  const resting = blocks.get(EPISTEMIC_INJECTION_KEY) ?? "";
  const draft = (name: string) => { injector.onMemberDrafted(CAST.indexOf(name)); return blocks.get(EPISTEMIC_INJECTION_KEY) ?? ""; };
  return { resting, draft };
}

describe("v2.7 plan 37: character-life lines ride the private block and its held-secret filter", () => {
  it("never puts a feeling, mood or plan in the resting prompt", () => {
    expect(harness([]).resting).toBe("");
  });

  it("shows each member only its own feelings", () => {
    const run = harness([]);
    expect(run.draft("Arin")).toContain("Your trust toward {{user}}");
    expect(run.draft("DM Narrator")).not.toContain("trust");
  });

  it("keeps a public agenda step that restates a held secret from the member it is kept from", () => {
    const run = harness([hiding()]);
    expect(run.draft("DM Narrator")).not.toContain("as everyone knows: met the smuggler");
    expect(run.draft("Arin")).toContain("met the smuggler at the docks");
  });

  it("control: with no held secret the same public step reaches the other member", () => {
    expect(harness([]).draft("DM Narrator")).toContain("as everyone knows: met the smuggler at the docks");
  });

  it("stages the lines even when knowledge tracking is off", () => {
    expect(harness([], false).draft("Arin")).toContain("Your mood right now: calm.");
  });
});
