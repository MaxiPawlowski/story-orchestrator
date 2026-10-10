import { plantedModel } from "../../../test/support/modelCall";
import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { wardenFamilyMode, type StagecraftAcceptMode, type WardenCheckFinding, type WardenNoteOp } from "@stagecraft/index";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createStagecraft } from "../extras";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "../settingsModel";
import type { StagecraftRuntimeState } from "../types";
import { testOwnership } from "../../../test/findings/testOwnership";

const chat: Array<Record<string, unknown>> = [];
const prompts: Array<[string, string, number]> = [];
const host = {
  setStoryExtensionPrompt: (key: string, text: string, depth: number) => { prompts.push([key, text, depth]); },
  clearStoryExtensionPrompt: () => undefined,
  getPlayerName: () => "Max",
};

const story: NormalizedStoryV2 = parseStoryV2OrThrow({
  format: 2, id: "agency-auto", title: "Auto", description: "W2.",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true }],
  transitions: [], roster: [],
});
const engineState = { activeCheckpointId: "cp1", boundary: 2, lastMessageId: 1 } as unknown as EngineState;

const agency: WardenCheckFinding = { family: "agency", text: "Agency: do not narrate Max acting.", facts: [], score: 3.4 };
const continuity: WardenCheckFinding = { family: "continuity", text: "Continuity: established — The bridge fell.", facts: ["The bridge fell."] };

const harness = (modes: { warden: StagecraftAcceptMode; agency?: StagecraftAcceptMode }, findings: WardenCheckFinding[], families = { agency: true, houseRules: [] as string[] }) => {
  let state: StagecraftRuntimeState = {
    ...createStagecraft(),
    settings: { createEnabled: false, createRequireMeasured: false, curatorEnabled: false, acceptMode: "review", wardenEnabled: true, wardenAcceptMode: modes.warden, ...(modes.agency ? { agencyAcceptMode: modes.agency } : {}) },
  };
  const asked: unknown[] = [];
  const coordinator = new StagecraftCoordinator({
    hosts: { prompt: host, chat: { chatRows: () => chat }, player: host, curator: {} } as never, ownership: testOwnership(),
    getStory: () => story, getState: () => engineState, getStagecraft: () => state, setStagecraft: (next) => { state = next; },
    model: plantedModel, getCanon: () => "", getOpenArcs: () => [],
    warden: { check: async (input) => { asked.push(input); return findings; }, facts: () => [{ id: "f", text: "The bridge fell." }], families: () => families, nudgeActive: () => false },
    journal: () => undefined, persist: async () => undefined, notify: () => undefined,
  } as StagecraftCoordinatorDeps);
  return { coordinator, asked, read: () => state };
};

beforeEach(() => {
  chat.splice(0, chat.length, { name: "Max", mes: "I wait.", is_user: true }, { name: "Guard", mes: "You walk off.", is_user: false });
  prompts.length = 0;
});

describe("v2.7 33 W2: the agency family has its own accept mode", () => {
  it("defaults to auto, and an install that never stored the key reads auto beside its stored shared mode", () => {
    expect(defaultGlobalSettings().stagecraft.agencyAcceptMode).toBe("auto");
    const migrated = sanitizeGlobalSettings({ stagecraft: { curatorEnabled: true, acceptMode: "review", wardenEnabled: true, wardenAcceptMode: "review" } }).stagecraft;
    expect(migrated).toEqual({ curatorEnabled: true, acceptMode: "review", wardenEnabled: true, wardenAcceptMode: "review", agencyAcceptMode: "auto", meanwhileAcceptMode: "auto", livingEnabled: true, branchingEnabled: true, prefetchEnabled: true, createEnabled: true, createRequireMeasured: false });
    expect(sanitizeGlobalSettings({ stagecraft: { agencyAcceptMode: "review" } }).stagecraft.agencyAcceptMode).toBe("review");
    expect(sanitizeGlobalSettings({ stagecraft: { agencyAcceptMode: "sometimes" } }).stagecraft.agencyAcceptMode).toBe("auto");
  });

  it("the shared mode off stops every family; otherwise agency and attention follow their own key and the rest the shared one", () => {
    expect(wardenFamilyMode({ wardenAcceptMode: "off", agencyAcceptMode: "auto" }, "agency")).toBe("off");
    expect(wardenFamilyMode({ wardenAcceptMode: "review" }, "agency")).toBe("auto");
    expect(wardenFamilyMode({ wardenAcceptMode: "review" }, "attention")).toBe("auto");
    expect(wardenFamilyMode({ wardenAcceptMode: "review", agencyAcceptMode: "review" }, "agency")).toBe("review");
    expect(wardenFamilyMode({ wardenAcceptMode: "review" }, "continuity")).toBe("review");
    expect(wardenFamilyMode({ wardenAcceptMode: "review" }, "house-rule")).toBe("review");
    expect(wardenFamilyMode({ wardenAcceptMode: "review" }, "lore")).toBe("review");
  });

  it("one record holds the agency op accepted beside the continuity op pending, and only the agency line reaches the next loud request", async () => {
    const env = harness({ warden: "review" }, [continuity, agency]);
    expect(await env.coordinator.runWardenPass(1)).toBe(true);
    const record = env.read().proposals.at(-1)!;
    expect(record.ops.map((entry) => [(entry.op as WardenNoteOp).family ?? "continuity", entry.status])).toEqual([["continuity", "pending"], ["agency", "accepted"]]);
    env.coordinator.onGenerationStarted("normal", false);
    expect(prompts).toEqual([["story_orchestrator_continuity", agency.text, 0]]);
    env.coordinator.commitNote(true);
    expect(env.read().proposals.at(-1)!.ops.map((entry) => entry.status)).toEqual(["pending", "applied"]);
  });

  it("payload invariance: a continuity finding alone still waits, so nothing reaches the request", async () => {
    const env = harness({ warden: "review" }, [continuity]);
    await env.coordinator.runWardenPass(1);
    env.coordinator.onGenerationStarted("normal", false);
    expect(prompts).toEqual([]);
  });

  it("payload invariance: with the agency check off the agency family is never asked and nothing is injected", async () => {
    const env = harness({ warden: "review" }, [agency], { agency: false, houseRules: [] });
    await env.coordinator.runWardenPass(1);
    env.coordinator.onGenerationStarted("normal", false);
    expect(env.asked).toHaveLength(1);
    expect((env.asked[0] as { agency: unknown }).agency).toBeNull();
    expect(prompts).toEqual([]);
  });

  it("the agency key at review waits like before; at off the agency family is left out of the request", async () => {
    const review = harness({ warden: "review", agency: "review" }, [agency]);
    await review.coordinator.runWardenPass(1);
    review.coordinator.onGenerationStarted("normal", false);
    expect(review.read().proposals.at(-1)!.ops[0].status).toBe("pending");
    expect(prompts).toEqual([]);
    const off = harness({ warden: "review", agency: "off" }, [agency]);
    await off.coordinator.runWardenPass(1);
    expect((off.asked[0] as { agency: unknown }).agency).toBeNull();
    expect(off.read().proposals.flatMap((record) => record.ops)).toEqual([]);
  });

  it("control: the shared mode off makes no call even with the agency key at auto", async () => {
    const env = harness({ warden: "off", agency: "auto" }, [agency]);
    expect(await env.coordinator.runWardenPass(1)).toBe(false);
    expect(env.asked).toEqual([]);
  });
});

describe("v2.7 finding 19: an OOC line is no player_message for the warden", () => {
  it.each(["((brb))", "OOC: can we skip this?", "(OOC) one question"])("%s leaves agency unasked, and the continuity check still runs", async (text) => {
    chat.splice(0, chat.length, { name: "Max", mes: "I wait.", is_user: true }, { name: "Guard", mes: "Fine.", is_user: false },
      { name: "Max", mes: text, is_user: true }, { name: "Guard", mes: "You walk off.", is_user: false });
    const env = harness({ warden: "review" }, [continuity]);
    await env.coordinator.runWardenPass(3);
    expect(env.asked).toEqual([expect.objectContaining({ agency: null, facts: ["The bridge fell."] })]);
  });

  it("control: a line with parentheses is the player's message", async () => {
    chat.splice(0, chat.length, { name: "Max", mes: "I wait (patiently).", is_user: true }, { name: "Guard", mes: "You walk off.", is_user: false });
    const env = harness({ warden: "review" }, [agency]);
    await env.coordinator.runWardenPass(1);
    expect(env.asked).toEqual([expect.objectContaining({ agency: { player: "Max", message: "I wait (patiently)." } })]);
  });
});
