import type { ModelCall } from "@extraction/index";
import type { InnerBeat } from "@memory/index";
import { ModelCallError } from "@extraction/modelError";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import { RunOwner } from "../runOwner";
import { createInnerBeatHost } from "../innerBeatHost";
import { INNER_CALLS_PER_TURN, InnerCoordinator, type InnerCoordinatorDeps } from "./innerCoordinator";

const story = {
  title: "Vault",
  id: "vault",
  version: 1,
  checkpointById: { cp1: { id: "cp1", name: "The Vault", objective: "Get inside.", type: "anchor", talk_control: { lead: "ponticius", speakers: [{ member: "arin", weight: 3 }, { member: "luke", weight: 1 }] } } },
  outgoingByCheckpoint: {},
  roster: [{ id: "arin", name: "Arin" }, { id: "ponticius", name: "Ponticius" }, { id: "luke", name: "Luke" }],
};

interface Setup {
  group?: boolean;
  fanOut?: "lead" | "top2";
  answers?: Array<string | Error | Promise<string>>;
  rows?: Array<{ name: string; mes: string; is_user?: boolean }>;
}

function harness(setup: Setup = {}) {
  const current: RunContext = { chatId: "chat-a", storyId: "vault", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  const answers = [...(setup.answers ?? ["BEAT: Stall them at the door.\nTONE: wary"])];
  const prompts: string[] = [];
  const model = (async (prompt: string, ask: { role: string; pass: string }) => {
    prompts.push(`${ask.role}/${ask.pass}: ${prompt}`);
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    return { text: await next ?? "", finish: "stop" };
  }) as unknown as ModelCall;
  const rows = setup.rows ?? [{ name: "Max", mes: "Open it.", is_user: true }, { name: "Arin", mes: "Not yet." }];
  let beats: InnerBeat[] | undefined;
  const journal = jest.fn();
  const persist = jest.fn(async () => {});
  const deps: InnerCoordinatorDeps = {
    getStory: () => story as never,
    getState: () => ({ activeCheckpointId: "cp1", boundary: 2 }) as never,
    model,
    ownership,
    fanOut: () => setup.fanOut ?? "lead",
    chatId: () => current.chatId,
    chatRows: () => rows,
    window: (from, to) => rows.slice(from, to + 1).map((row) => ({ speaker: row.name, text: row.mes, isUser: Boolean(row.is_user) })),
    group: () => setup.group !== false,
    enabledIds: () => ["arin", "ponticius", "luke"],
    lastSpeaker: () => "arin",
    privateRows: (rosterId) => (rosterId === "ponticius" ? "- What you want: keep the guild solvent" : ""),
    steering: () => "raise the stakes",
    getBeats: () => beats,
    setBeats: (next) => { beats = next; },
    persist,
    journal,
  };
  return { deps, current, prompts, rows, journal, persist, beats: () => beats, answers };
}

describe("inner beat candidates (v2.6 plan 06 C, Q3 arms)", () => {
  it("lead arm: the scene lead only; top2 arm: the lead then the heaviest other, never the last speaker", () => {
    const lead = harness();
    expect(new InnerCoordinator(lead.deps).candidates(story as never, { activeCheckpointId: "cp1" } as never)).toEqual(["ponticius"]);
    const top2 = harness({ fanOut: "top2" });
    expect(new InnerCoordinator(top2.deps).candidates(story as never, { activeCheckpointId: "cp1" } as never)).toEqual(["ponticius", "luke"]);
  });

  it("solo: the one cast member, and nobody when a narrator voices several", () => {
    const solo = harness({ group: false });
    expect(new InnerCoordinator(solo.deps).candidates({ ...story, roster: [story.roster[0]] } as never, { activeCheckpointId: "cp1" } as never)).toEqual(["arin"]);
    expect(new InnerCoordinator(solo.deps).candidates(story as never, { activeCheckpointId: "cp1" } as never)).toEqual([]);
  });
});

describe("the inner beat pass (v2.6 plan 06 C)", () => {
  it("writes one beat per candidate on role inner, built on the reply it read, with the member's private rows and the steering hint", async () => {
    const { deps, prompts, beats, persist } = harness();
    expect(await new InnerCoordinator(deps).run()).toBe(1);
    expect(prompts[0]).toMatch(/^inner\/inner: /);
    expect(prompts[0]).toContain("keep the guild solvent");
    expect(prompts[0]).toContain("raise the stakes");
    expect(prompts[0]).toContain("Never decide what the player does");
    expect(beats()).toEqual([expect.objectContaining({ chatId: "chat-a", memberId: "ponticius", basedOnMessageId: 1, checkpointId: "cp1", beat: "Stall them at the door.", tone: "wary" })]);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does nothing unless the newest message is a character reply (the player's line is already in)", async () => {
    const { deps, prompts } = harness({ rows: [{ name: "Arin", mes: "Not yet." }, { name: "Max", mes: "Open it.", is_user: true }] });
    expect(await new InnerCoordinator(deps).run()).toBe(0);
    expect(prompts).toEqual([]);
  });

  it("C2 structural bound: at most two inner calls per player turn, repairs and group chains included", async () => {
    const { deps, prompts, rows } = harness({ fanOut: "top2", answers: ["no format", "still none", "BEAT: x"] });
    const coordinator = new InnerCoordinator(deps);
    await coordinator.run();
    rows.push({ name: "Luke", mes: "Me too!" });
    await coordinator.run();
    expect(prompts).toHaveLength(INNER_CALLS_PER_TURN);
    rows.push({ name: "Max", mes: "Fine.", is_user: true }, { name: "Arin", mes: "Go." });
    await coordinator.run();
    expect(prompts.length).toBeGreaterThan(INNER_CALLS_PER_TURN);
    expect(prompts.length).toBeLessThanOrEqual(2 * INNER_CALLS_PER_TURN);
  });

  it("repairs a malformed answer once, and journals an unusable one without writing", async () => {
    const repaired = harness({ answers: ["I think she waits.", "BEAT: Wait for the guard change."] });
    await new InnerCoordinator(repaired.deps).run();
    expect(repaired.prompts[1]).toContain("did not follow the format");
    expect(repaired.beats()?.[0].beat).toBe("Wait for the guard change.");
    const hopeless = harness({ answers: ["nothing", "still nothing"] });
    await new InnerCoordinator(hopeless.deps).run();
    expect(hopeless.beats()).toBeUndefined();
    expect(hopeless.journal).toHaveBeenCalledWith("Inner beat unusable", expect.stringContaining("ponticius"));
  });

  it("writes nothing when the chat changed while the call was out", async () => {
    let release: (value: string) => void = () => {};
    const held = new Promise<string>((resolve) => { release = resolve; });
    const { deps, current, beats, persist } = harness({ answers: [held] });
    const running = new InnerCoordinator(deps).run();
    current.chatId = "chat-b";
    release("BEAT: Stall them.");
    await running;
    expect(beats()).toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
  });

  it("control: the same held call that lands in its own chat is written", async () => {
    let release: (value: string) => void = () => {};
    const held = new Promise<string>((resolve) => { release = resolve; });
    const { deps, beats } = harness({ answers: [held] });
    const running = new InnerCoordinator(deps).run();
    release("BEAT: Stall them.");
    await running;
    expect(beats()?.[0].beat).toBe("Stall them.");
  });

  it("inner|aborted: a held inner call aborted by a chat switch cancels its request and writes nothing", async () => {
    const { deps, beats, persist } = harness();
    const world = { chat: "chat-a" };
    const owner = new RunOwner({ openChatId: () => world.chat, storyId: () => "vault", playedVersion: () => 1 });
    owner.bump();
    const signals: AbortSignal[] = [];
    const model = ((_prompt: string, ask: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      if (ask.signal) signals.push(ask.signal);
      ask.signal?.addEventListener("abort", () => reject(new ModelCallError("lapsed", "the request was cancelled")));
    })) as unknown as ModelCall;
    const running = new InnerCoordinator({ ...deps, model, ownership: owner.ownership, chatId: () => world.chat }).run();
    await Promise.resolve();
    world.chat = "chat-b";
    owner.bump();
    await expect(running).rejects.toThrow("the request was cancelled");
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
    expect(beats()).toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
  });

  it("control: the same held call nobody aborts lands", async () => {
    const { deps, beats } = harness();
    const owner = new RunOwner({ openChatId: () => "chat-a", storyId: () => "vault", playedVersion: () => 1 });
    owner.bump();
    let release: (value: { text: string; finish: string }) => void = () => {};
    const signals: AbortSignal[] = [];
    const model = ((_prompt: string, ask: { signal?: AbortSignal }) => new Promise((resolve) => {
      if (ask.signal) signals.push(ask.signal);
      release = resolve;
    })) as unknown as ModelCall;
    const running = new InnerCoordinator({ ...deps, model, ownership: owner.ownership }).run();
    await Promise.resolve();
    release({ text: "BEAT: Hold the door.", finish: "stop" });
    await running;
    expect(signals[0]?.aborted).toBe(false);
    expect(beats()?.[0].beat).toBe("Hold the door.");
  });

  it("a backend failure rejects the pass and writes nothing (the boundary work catches it)", async () => {
    const { deps, beats } = harness({ answers: [new Error("API request failed")] });
    await expect(new InnerCoordinator(deps).run()).rejects.toThrow("API request failed");
    expect(beats()).toBeUndefined();
  });

  it("journals a beat that was never drafted when a newer one replaces it", async () => {
    const { deps, rows, journal } = harness();
    const coordinator = new InnerCoordinator(deps);
    await coordinator.run();
    rows.push({ name: "Max", mes: "Now.", is_user: true }, { name: "Arin", mes: "Fine." });
    await coordinator.run();
    expect(journal).toHaveBeenCalledWith("Inner beat unused", expect.stringContaining("message 1"));
  });
});

describe("the beat at draft (host)", () => {
  it("is used only when fresh: same chat, same checkpoint, built on the newest character message before the player's line", async () => {
    const { deps, rows, beats, journal } = harness();
    const host = createInnerBeatHost({ ...deps, enabled: () => true, memberName: (id) => id });
    await host.run();
    rows.push({ name: "Max", mes: "Go on.", is_user: true });
    expect(host.beatFor("ponticius")).toBe("Stall them at the door.");
    expect(beats()?.[0].used).toBe(true);
    expect(journal).toHaveBeenLastCalledWith("Inner beat used for ponticius");
    expect(host.beatFor("luke")).toBe("");
    rows.push({ name: "Arin", mes: "Later." }, { name: "Max", mes: "Now.", is_user: true });
    expect(host.beatFor("ponticius")).toBe("");
    expect(journal).toHaveBeenLastCalledWith("Inner beat stale for ponticius", expect.any(String));
  });

  it("switched off: never loads the pass and never adds a beat", async () => {
    const { deps } = harness();
    const host = createInnerBeatHost({ ...deps, enabled: () => false, memberName: (id) => id });
    expect(host.beatFor("ponticius")).toBe("");
  });
});
