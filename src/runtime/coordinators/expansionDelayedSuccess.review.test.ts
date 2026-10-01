import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { findStubExpansionCandidate, type ExpansionRuntimeState } from "@generation/index";
import { recordingModel } from "../../../test/support/modelCall";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "../runToken";
import { ExpansionCoordinator } from "./expansionCoordinator";

const root = join(__dirname, "..", "..", "..");
const raw = JSON.parse(readFileSync(join(root, "test/fixtures/background-generation.story.json"), "utf-8"));
const story = parseStoryV2OrThrow(raw);
const good = readFileSync(join(root, "test/goldens/background-generator-played.response.txt"), "utf-8");
const candidate = findStubExpansionCandidate(story, "start")!;

const harness = (switchDuring: "generation" | "critic" | null) => {
  const stores: Record<string, ExpansionRuntimeState> = {
    "chat-a": { entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } },
    "chat-b": { entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } },
  };
  const context: RunContext = { chatId: "chat-a", storyId: story.id ?? "s", playedVersion: 1, sessionEpoch: 1, windowRevision: 0 };
  const ownership: RunOwnership = { mint: (window) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const switchChat = () => { context.chatId = "chat-b"; context.sessionEpoch += 1; };
  const replaced: unknown[] = [];
  let persists = 0;
  const model = recordingModel((_prompt, ask) => {
    if (ask.pass === switchDuring) switchChat();
    return ask.pass === "generation" ? good : "{\"pass\": true, \"issues\": []}";
  });
  const coordinator = new ExpansionCoordinator({
    hosts: { player: { getPlayerName: () => "Max" } },
    getStory: () => story,
    getStoryRaw: () => raw,
    getState: () => ({ activeCheckpointId: "start", blackboard: { values: { key_found: false, approach: "unknown" }, versions: {}, latched: {} } }) as unknown as EngineState,
    getExpansion: () => stores[String(context.chatId)],
    model,
    getCanon: () => "",
    getFactTexts: () => [],
    replaceStory: (next: unknown) => { replaced.push(next); },
    setStatus: () => undefined,
    persist: async () => { persists += 1; },
    notify: () => undefined,
    ownership,
  } as never);
  return { coordinator, stores, replaced, persists: () => persists, model };
};

const key = `${candidate.sourceCheckpointId}->${candidate.stubId}->${candidate.targetAnchorId}`;

describe("AS-18: a VALID chain that answers after a chat switch writes, merges and persists nothing", () => {
  it("control: with no switch the valid chain is filed, merged and persisted in its own chat", async () => {
    const env = harness(null);
    await env.coordinator.generate(candidate);
    expect(["validated", "needs_review"]).toContain(env.stores["chat-a"].entries[key]?.status);
    expect(env.stores["chat-a"].entries[key]?.beats.length).toBeGreaterThan(0);
    expect(env.replaced).toHaveLength(1);
    expect(env.persists()).toBe(1);
  });

  it.each(["generation", "critic"] as const)("switched during the %s call: neither chat's cache, the merged story nor a save is touched", async (when) => {
    const env = harness(when);
    await env.coordinator.generate(candidate);
    expect(env.model.calls.map((call) => call.ask.pass)).toContain(when);
    expect(env.stores["chat-b"].entries).toEqual({});
    expect(env.stores["chat-a"].entries[key]?.status).toBe("generating");
    expect(env.stores["chat-a"].entries[key]?.beats).toEqual([]);
    expect(env.replaced).toEqual([]);
    expect(env.persists()).toBe(0);
  });
});
