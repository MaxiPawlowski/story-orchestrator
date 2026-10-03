import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { findStubExpansionCandidate, type ExpansionRuntimeState } from "@generation/index";
import type { ModelAsk } from "@extraction/modelRoute";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "../runToken";
import { ExpansionCoordinator } from "./expansionCoordinator";

const root = join(__dirname, "..", "..", "..");
const raw = JSON.parse(readFileSync(join(root, "test/fixtures/background-generation.story.json"), "utf-8"));
const story = parseStoryV2OrThrow(raw);
const good = readFileSync(join(root, "test/goldens/background-generator-played.response.txt"), "utf-8");
const candidate = findStubExpansionCandidate(story, "start")!;
const key = `${candidate.sourceCheckpointId}->${candidate.stubId}->${candidate.targetAnchorId}`;

const harness = () => {
  const store: ExpansionRuntimeState = { entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } };
  const context: RunContext = { chatId: "chat-a", storyId: story.id ?? "s", playedVersion: 1, sessionEpoch: 1, windowRevision: 0 };
  const ownership: RunOwnership = { mint: (window) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  let release: (value: string) => void = () => undefined;
  const slow = new Promise<string>((resolve) => { release = resolve; });
  const live: ModelAsk[] = [];
  const model = async (_prompt: string, ask: ModelAsk) => {
    if (ask.pass !== "generation") return { text: "{\"pass\": true, \"issues\": []}", finish: "stop" as const };
    if (typeof ask.debugResponse === "string") return { text: ask.debugResponse, finish: "stop" as const };
    live.push(ask);
    return { text: await slow, finish: "stop" as const };
  };
  const jobs: Array<() => Promise<void>> = [];
  const coordinator = new ExpansionCoordinator({
    hosts: { player: { getPlayerName: () => "Max" } },
    getStory: () => story,
    getStoryRaw: () => raw,
    getState: () => ({ activeCheckpointId: "start", boundary: 1, blackboard: { values: { key_found: false, approach: "unknown" }, versions: {}, latched: {} } }) as unknown as EngineState,
    getExpansion: () => store,
    model,
    getCanon: () => "",
    getFactTexts: () => [],
    replaceStory: () => undefined,
    setStatus: () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
    ownership,
  } as never);
  const schedule = (_reason: string, run: () => Promise<void>) => { jobs.push(run); };
  return { coordinator, store, release, jobs, schedule, live };
};

describe("T7 plan05/plan06: an older generation never overwrites a newer one for the same chain", () => {
  it("the boundary's queued generation, answering after the author's generate-now, leaves the validated chain alone", async () => {
    const env = harness();
    env.coordinator.scheduleForActive(env.schedule);
    const queued = env.jobs[0]!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await env.coordinator.generate(candidate, good);
    expect(env.store.entries[key]?.status).toBe("validated");
    expect(env.live).toHaveLength(1);
    env.release("not a chain");
    await queued;
    expect(env.store.entries[key]?.status).toBe("validated");
  });

  it("a queued generation that starts after generate-now already settled the chain does not run", async () => {
    const env = harness();
    env.coordinator.scheduleForActive(env.schedule);
    await env.coordinator.generate(candidate, good);
    expect(env.store.entries[key]?.status).toBe("validated");
    env.release("not a chain");
    await env.jobs[0]!();
    expect(env.store.entries[key]?.status).toBe("validated");
    expect(env.live).toHaveLength(0);
  });

  it("control: a queued generation on its own still runs and records its outcome", async () => {
    const env = harness();
    env.coordinator.scheduleForActive(env.schedule);
    const queued = env.jobs[0]!();
    env.release("not a chain");
    await queued;
    expect(env.store.entries[key]?.status).toBe("failed");
  });
});
