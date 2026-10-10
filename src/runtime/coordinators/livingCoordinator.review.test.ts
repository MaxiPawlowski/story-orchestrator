import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, StoryEngine, type NormalizedStoryV2 } from "@engine/index";
import { diffStories } from "@engine/storyDiff";
import type { ModelCall, SchedulerJob } from "@extraction/index";
import { compactOps, graphEpoch, livingRaw } from "@generation/living/fold";
import { directorLeads, followsPlayer, type DivergenceAnswer } from "@generation/living/divergence";
import type { LivingRuntimeState } from "@generation/living/types";
import { mintToken, tokenMatches, type RunContext } from "../runToken";
import type { LivingInputs } from "../livingInputs";
import { LivingCoordinator } from "./livingCoordinator";

const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures", `${name}.story.json`), "utf8"));

const answer = (index: number, patch: Record<string, unknown> = {}) => JSON.stringify({
  name: `Turn ${index}`, objective: `The tide brings something new to the quay, the ${index}th sign.`, tension: "stirring", snapshot: {},
  opens_when: { new: { key: `sign_${index}`, rubric: `Has sign ${index} been seen?` } }, new_qualities: [], builds_on: null, new_chapter: false, final: false, reason: `pass ${index}`,
  ...patch,
});

const inputs = (refused: string | null = null): LivingInputs => ({
  canon: "", openThreads: [], resolvedThreads: [], plans: [], refused, playerNames: ["Max"], tension: null, restatesSecret: () => false, scrub: (text) => text,
});

const OFF_SCRIPT = "I walk away from the ford and follow the miller's dog into the reeds.";

interface RigOptions {
  story?: string;
  authorView?: boolean;
  answers?: string[];
  judge?: Array<DivergenceAnswer | null>;
  prefetch?: boolean;
  refused?: string | null;
}

const rig = (options: RigOptions = {}) => {
  const raw = fixture(options.story ?? "living-premise");
  const context: RunContext = { chatId: "c1", storyId: "s1", storyHash: "h1", sessionEpoch: 1, windowRevision: 0 };
  const engine = new StoryEngine({ now: () => 0 });
  const loaded = { record: { id: "s1", hash: "h1", raw }, story: parseStoryV2OrThrow(raw) as NormalizedStoryV2 };
  engine.loadStory(loaded.story);
  const extras: { living?: LivingRuntimeState; authorView: boolean } = { authorView: options.authorView ?? false };
  const answers = [...(options.answers ?? [])];
  const judge = [...(options.judge ?? [])];
  const calls = { persist: 0, notify: 0, journal: [] as string[], notes: [] as string[], saved: [] as unknown[], prompts: [] as string[] };
  const hooks: { duringModel?: () => void; duringJudge?: () => void; onMint?: () => void } = {};
  let message = 0;
  const rows: Array<Record<string, unknown>> = [{ name: "Narrator", is_user: false, mes: "The mill wheel stands still." }];
  const judgeCalls = { count: 0 };
  const model = (async (prompt: string) => {
    if (prompt.startsWith("Review one generated turning point")) return { text: JSON.stringify({ pass: true, issues: [] }), finish: "stop" as const };
    calls.prompts.push(prompt);
    hooks.duringModel?.();
    return { text: answers.shift() ?? "", finish: "stop" as const };
  }) as ModelCall;
  const coordinator = new LivingCoordinator({
    getStory: () => loaded.story,
    getState: () => engine.serialize(),
    loaded: () => ({ raw: loaded.record.raw, hash: loaded.record.hash, storyId: loaded.record.id }),
    getLiving: () => extras.living,
    setLiving: (next) => { extras.living = next; },
    setPlayedRaw: (next) => {
      loaded.record = { ...loaded.record, raw: next };
      loaded.story = parseStoryV2OrThrow(next);
      engine.replaceGraph(loaded.story);
    },
    pruneExpansion: () => 0,
    discardUnknownPending: () => engine.discardPendingUnknown(),
    ensureActive: () => engine.ensureActiveCheckpoint(),
    historyFloor: () => engine.historyFrom().boundary,
    enabled: () => true,
    branching: () => true,
    prefetch: () => options.prefetch ?? true,
    authorView: () => extras.authorView,
    sealsOn: () => true,
    inputs: () => inputs(options.refused ?? null),
    recentTurns: async () => ["Max: I walk away from the ford and follow the miller's dog into the reeds."],
    chatRows: () => rows,
    askDivergence: async () => { judgeCalls.count += 1; hooks.duringJudge?.(); return judge.shift() ?? null; },
    saveRecord: (story) => { calls.saved.push(story); return { ok: true, id: String(story.id), title: story.title }; },
    storyIdTaken: () => false,
    model,
    ownership: { mint: () => { const token = mintToken(context); hooks.onMint?.(); return token; }, check: (token) => tokenMatches(context, token) },
    journal: (summary, note) => { calls.journal.push(summary); calls.notes.push(note); },
    persist: async () => { calls.persist += 1; },
    notify: () => { calls.notify += 1; },
  });
  coordinator.adopt("activate");
  const commit = async (said: string = OFF_SCRIPT) => {
    rows.push({ name: "Max", is_user: true, mes: said }, { name: "Narrator", is_user: false, mes: "The reeds hiss." });
    message = rows.length - 1;
    const result = engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
    await coordinator.applyAccepted({ boundary: result.boundary, messageId: message });
    coordinator.compact();
    return result;
  };
  const set = (q: string, v: string | number | boolean, source: "extractor" | "mechanical" = "extractor") =>
    engine.enqueue({ source, blackboardVersionSum: 0, deltas: [{ q, v, source: source === "mechanical" ? "code" : "extractor" }] });
  const reply = async () => {
    rows.push({ name: "Miller", is_user: false, mes: "The miller shrugs." });
    message = rows.length - 1;
    const result = engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
    await coordinator.applyAccepted({ boundary: result.boundary, messageId: message });
    return result;
  };
  return { engine, loaded, extras, coordinator, calls, context, hooks, commit, reply, set, raw, judgeCalls, at: () => ({ boundary: engine.serialize().boundary, messageId: message }) };
};

const played = (rigged: ReturnType<typeof rig>) => JSON.stringify(rigged.loaded.record.raw);

describe("v2.8 22 living director at runtime", () => {
  it("applies an accepted turning point at the next boundary", async () => {
    const rigged = rig({ answers: [answer(1)] });
    expect(rigged.coordinator.due()).toBe(true);
    const proposal = await rigged.coordinator.propose();
    expect(proposal?.status).toBe("accepted");
    expect(rigged.loaded.story.checkpointById.liv_1).toBeUndefined();
    const result = await rigged.commit();
    expect(rigged.loaded.story.checkpointById.liv_1).toMatchObject({ name: "Turn 1", type: "anchor", chapter: "liv_ch_1" });
    expect(rigged.extras.living?.ops.every((op) => op.boundary === result.boundary)).toBe(true);
    expect(rigged.coordinator.due()).toBe(false);
    expect(rigged.calls.journal).toContain("the story grew: 1 director change(s) applied");
  });

  it("in suggest mode waits for the author, and an edit lands in the graph", async () => {
    const rigged = rig({ story: "living-hybrid", authorView: true, answers: [answer(1)] });
    rigged.set("ford_found", true);
    await rigged.commit();
    expect(rigged.engine.serialize().activeCheckpointId).toBe("ford");
    const proposal = await rigged.coordinator.propose();
    expect(proposal?.status).toBe("proposed");
    await rigged.commit();
    expect(rigged.loaded.story.checkpointById.liv_1).toBeUndefined();
    expect(await rigged.coordinator.decide(proposal?.id ?? "", "accepted", { name: "The Mill Pond" })).toBe(true);
    await rigged.commit();
    expect(rigged.loaded.story.checkpointById.liv_1?.name).toBe("The Mill Pond");
    expect(rigged.loaded.story.checkpointById.liv_1?.chapter).toBeUndefined();
  });

  it("player mode always gets auto, whatever the story declares", async () => {
    const rigged = rig({ story: "living-hybrid", authorView: false, answers: [answer(1)] });
    rigged.set("ford_found", true);
    await rigged.commit();
    expect((await rigged.coordinator.propose())?.status).toBe("accepted");
  });

  it("discards an answer that lands after the chat moved", async () => {
    const rigged = rig({ answers: [answer(1)] });
    rigged.hooks.duringModel = () => { rigged.context.chatId = "c2"; };
    expect(await rigged.coordinator.propose()).toBeNull();
    expect(rigged.extras.living?.proposals ?? []).toEqual([]);
    expect(rigged.calls.persist).toBe(0);
  });

  it("discards an answer built for a graph a rollback replaced, and withdraws a waiting card", async () => {
    const rigged = rig({ answers: [answer(1), answer(2)] });
    await rigged.coordinator.propose();
    await rigged.commit();
    rigged.set("liv_1_sign_1", true);
    await rigged.commit();
    rigged.set("progress_toward_liv_1", 1, "mechanical");
    await rigged.commit();
    expect(rigged.engine.serialize().activeCheckpointId).toBe("liv_1");
    rigged.hooks.duringModel = () => { rigged.coordinator.restoreAfterRollback(rigged.engine.serialize().boundary); };
    expect(await rigged.coordinator.propose()).toBeNull();
    expect(rigged.calls.journal).toContain("living director answer discarded");
    rigged.hooks.duringModel = undefined;
  });

  it("a rollback past the boundary that applied a turning point takes it back, discards pending writes for its values and withdraws waiting cards", async () => {
    const rigged = rig({ answers: [answer(1), answer(2)] });
    await rigged.coordinator.propose();
    const applied = await rigged.commit();
    expect(rigged.loaded.story.checkpointById.liv_1).toBeDefined();
    rigged.set("liv_1_sign_1", true);
    expect(rigged.engine.rollbackTo(applied.boundary - 1)).toEqual({ ok: true, result: "applied" });
    expect(rigged.coordinator.restoreAfterRollback(applied.boundary - 1)).toBeGreaterThan(0);
    expect(rigged.loaded.story.checkpointById.liv_1).toBeUndefined();
    expect(rigged.engine.pendingWrites.flatMap((write) => write.deltas.map((delta) => delta.q))).not.toContain("liv_1_sign_1");
    expect(rigged.calls.journal).toContain("living story stepped back");
    expect(rigged.coordinator.due()).toBe(true);
  });

  it("rollback ≡ replay and reopen ≡ replay for the graph over seeded runs (property)", async () => {
    const seeds = [3, 11, 29, 47, 61, 83];
    let droppedOps = 0;
    let generated = 0;
    for (const seed of seeds) {
      let value = seed;
      const random = () => { value = (value * 1103515245 + 12345) % 2147483648; return value / 2147483648; };
      const steps = Array.from({ length: 24 }, () => random());
      const run = async (stopAt: number | null) => {
        const rigged = rig({ answers: Array.from({ length: 20 }, (_, index) => answer(index + 1)) });
        for (const roll of steps) {
          if (stopAt !== null && rigged.engine.serialize().boundary >= stopAt) break;
          if (rigged.coordinator.due() && roll < 0.5) await rigged.coordinator.propose();
          const state = rigged.engine.serialize();
          const out = (rigged.loaded.story.outgoingByCheckpoint[state.activeCheckpointId] ?? [])[0];
          if (out && roll > 0.3) {
            const leaf = "q" in out.gate ? out.gate : null;
            if (leaf && typeof leaf.v !== "object") rigged.set(leaf.q, leaf.v, rigged.loaded.story.qualityByKey[leaf.q]?.source === "code" ? "mechanical" : "extractor");
          }
          await rigged.commit();
        }
        return rigged;
      };
      const full = await run(null);
      const end = full.engine.serialize().boundary;
      const cut = Math.max(1, Math.floor(steps[0] * end));
      generated += Object.keys(full.loaded.story.checkpointById).filter((id) => /^liv_\d+$/.test(id)).length;
      expect(full.engine.rollbackTo(cut).ok).toBe(true);
      droppedOps += full.coordinator.restoreAfterRollback(cut);
      const replay = await run(cut);
      expect({ seed, cut, graph: played(full) }).toEqual({ seed, cut, graph: played(replay) });
      expect({ seed, active: full.engine.serialize().activeCheckpointId, values: full.engine.serialize().blackboard.values })
        .toEqual({ seed, active: replay.engine.serialize().activeCheckpointId, values: replay.engine.serialize().blackboard.values });
      const stored = JSON.parse(JSON.stringify(full.extras.living)) as LivingRuntimeState;
      expect(JSON.stringify(livingRaw(stored))).toBe(played(full));
      expect(JSON.stringify(livingRaw(compactOps(stored, cut)))).toBe(played(full));
    }
    expect(generated).toBeGreaterThan(seeds.length);
    expect(droppedOps).toBeGreaterThan(0);
  });

  it("an author update after compaction diffs authored against authored: generated nodes and the active checkpoint survive (R3-11)", async () => {
    const rigged = rig({ story: "living-hybrid", answers: [answer(1), answer(2)] });
    rigged.set("ford_found", true);
    await rigged.commit();
    await rigged.coordinator.propose();
    await rigged.commit();
    rigged.set("liv_1_sign_1", true);
    await rigged.commit();
    const living = rigged.extras.living as LivingRuntimeState;
    rigged.extras.living = compactOps(living, rigged.engine.serialize().boundary);
    expect(rigged.extras.living.folded.length).toBeGreaterThan(0);
    const edited = JSON.parse(JSON.stringify(rig({ story: "living-hybrid" }).raw)) as { checkpoints: Array<Record<string, unknown>>; transitions: unknown[] };
    edited.checkpoints[0].objective = "The miller still refuses to grind, louder now.";
    edited.checkpoints.push({ id: "weir", name: "The Weir", objective: "A side path to the weir.", type: "anchor" });
    edited.transitions.push({ from: "mill", to: "weir", priority: 0, gate: { q: "miller_mood", op: "==", v: "warm" } });
    const refolded = rigged.coordinator.refold({ raw: edited as unknown as Record<string, unknown>, hash: "h2" });
    if ("broken" in refolded) throw new Error(refolded.broken.join("; "));
    const diff = diffStories(rigged.loaded.story, refolded.story, rigged.engine.serialize());
    expect(diff.classification).not.toBe("invalidating");
    expect(refolded.story.checkpointById.liv_1).toBeDefined();
    expect(refolded.story.checkpointById[rigged.engine.serialize().activeCheckpointId]).toBeDefined();
    expect(JSON.stringify(refolded.raw)).toBe(JSON.stringify(livingRaw({ ...(rigged.extras.living as LivingRuntimeState), authored: { raw: edited as unknown as Record<string, unknown>, hash: "h2" } })));
    const control = diffStories(rigged.loaded.story, parseStoryV2OrThrow(edited), rigged.engine.serialize());
    expect(control.entries.some((entry) => entry.message.includes("liv_1"))).toBe(true);
  });

  it("an update that removes the anchor the director continued from is reported broken", async () => {
    const rigged = rig({ story: "living-hybrid", answers: [answer(1)] });
    rigged.set("ford_found", true);
    await rigged.commit();
    await rigged.coordinator.propose();
    await rigged.commit();
    const edited = JSON.parse(JSON.stringify(rigged.raw)) as { checkpoints: Array<{ id: string }>; transitions: Array<{ to: string }>; living: Record<string, unknown> };
    edited.checkpoints = edited.checkpoints.filter((checkpoint) => checkpoint.id !== "ford");
    edited.transitions = [];
    delete edited.living.authored_until;
    expect("broken" in rigged.coordinator.refold({ raw: edited as unknown as Record<string, unknown>, hash: "h3" })).toBe(true);
  });

  it("a director call that fails writes nothing, rethrows for the breaker and leaves the story ready to ask again", async () => {
    const rigged = rig();
    rigged.hooks.duringModel = () => { throw new Error("connect ECONNREFUSED"); };
    await expect(rigged.coordinator.propose()).rejects.toThrow("ECONNREFUSED");
    expect(rigged.extras.living?.proposals ?? []).toEqual([]);
    expect(rigged.coordinator.due()).toBe(true);
  });

  it("a malformed answer, twice, is recorded as a failed pass with its reasons and changes nothing", async () => {
    const rigged = rig({ answers: ["not json", "{\"name\": 3}"] });
    const proposal = await rigged.coordinator.propose();
    expect(proposal).toMatchObject({ status: "failed", ops: [] });
    expect(proposal?.issues.join(" ")).toContain("name is required");
    await rigged.commit();
    expect(rigged.loaded.story.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(["liv_open"]);
  });

  it("a second apply at the same boundary writes nothing more", async () => {
    const rigged = rig({ answers: [answer(1)] });
    await rigged.coordinator.propose();
    const result = await rigged.commit();
    const ops = rigged.extras.living?.ops.length;
    expect(await rigged.coordinator.applyAccepted({ boundary: result.boundary, messageId: 2 })).toBe(0);
    expect(rigged.extras.living?.ops.length).toBe(ops);
  });

  it("the director call carries the run's abort signal", async () => {
    const rigged = rig({ answers: [answer(1)] });
    const signals: Array<AbortSignal | undefined> = [];
    const original = (rigged.coordinator as unknown as { deps: { model: ModelCall } }).deps.model;
    (rigged.coordinator as unknown as { deps: { model: ModelCall } }).deps.model = (async (prompt, ask) => { signals.push(ask.signal); return original(prompt, ask); }) as ModelCall;
    await rigged.coordinator.propose();
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("saves nothing when the chat moved before the unit loaded", async () => {
    const rigged = rig({ answers: [answer(1)] });
    rigged.hooks.onMint = () => { void Promise.resolve().then(() => { rigged.context.chatId = "c2"; }); };
    expect(await rigged.coordinator.saveAsStory({ includeUnreached: false })).toMatchObject({ ok: false });
    expect(rigged.calls.saved).toEqual([]);
  });

  it("Save as story keeps reached turning points only, and the copy validates", async () => {
    const rigged = rig({ answers: [answer(1), answer(2)] });
    await rigged.coordinator.propose();
    await rigged.commit();
    const saved = await rigged.coordinator.saveAsStory({ includeUnreached: false });
    expect(saved).toMatchObject({ ok: true, excluded: 2 });
    const copy = rigged.calls.saved[0] as { checkpoints: Array<{ id: string }> };
    expect(copy.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(["liv_open", "liv_next_1_way", "liv_next_1"]);
    expect(JSON.stringify(copy)).not.toContain("Turn 1");
    expect(() => parseStoryV2OrThrow(copy)).not.toThrow();
  });
});

describe("v2.8 22 director length limits (L1 run 2: four refusals for an over-long objective)", () => {
  const overlong = JSON.parse(readFileSync(join(process.cwd(), "test/goldens/live/living-director-repair/deepseek-overlong.json"), "utf8")) as Record<string, string>;

  it("the prompt states every length limit it is held to, with a word count", async () => {
    const rigged = rig({ answers: [overlong.compliant] });
    await rigged.coordinator.propose();
    expect(rigged.calls.prompts[0]).toContain("name at most 60 characters (two to six words)");
    expect(rigged.calls.prompts[0]).toContain("objective at most 400 characters (about 55 words");
    expect(rigged.calls.prompts[0]).toContain("each rubric at most 240 characters");
  });

  it("an over-long objective that ends on whole sentences is trimmed at a sentence boundary and lands", async () => {
    const rigged = rig({ answers: [overlong.trimmable] });
    const proposal = await rigged.coordinator.propose();
    expect(proposal?.status).toBe("accepted");
    expect(proposal?.attempts).toBe(1);
    expect(proposal?.draft?.anchor.objective.length).toBeLessThanOrEqual(400);
    expect(proposal?.draft?.anchor.objective).toMatch(/still in the grate\.$/);
    expect(proposal?.draft?.repaired?.[0]).toMatch(/^objective trimmed at a sentence boundary from 477 to \d+ characters$/);
    await rigged.commit();
    expect(rigged.loaded.story.checkpointById.liv_1).toMatchObject({ name: "The Lantern Keeper's Ledger" });
  });

  it("one sentence over the limit is re-asked naming the limit, and the second answer lands", async () => {
    const rigged = rig({ answers: [overlong.unsplittable, overlong.compliant] });
    const proposal = await rigged.coordinator.propose();
    expect(proposal).toMatchObject({ status: "accepted", attempts: 2 });
    expect(rigged.calls.prompts[1]).toContain("objective is longer than 400 characters (it has 436; about 55 words at most)");
  });

  it("a refusal is recorded as a structured reason in the proposal ring and the journal", async () => {
    const rigged = rig({ answers: [overlong.unsplittable, overlong.unsplittable] });
    const proposal = await rigged.coordinator.propose();
    expect(proposal?.status).toBe("failed");
    expect(proposal?.refusal).toEqual({ stage: "parse", reasons: [{ code: "too-long", field: "objective" }] });
    expect(rigged.calls.journal).toContain("living director wrote nothing");
    expect(rigged.calls.notes.at(-1)).toMatch(/^\[parse\] objective:too-long: objective is longer than 400 characters/);
  });
});

describe("v2.8 22 divergence branching", () => {
  const atMill = async (judge: Array<DivergenceAnswer | null>, answers: string[] = [], prefetch = true, refused: string | null = null) => {
    const rigged = rig({ story: "living-hybrid", judge, answers, prefetch, refused });
    await rigged.commit();
    return rigged;
  };
  const placed = () => {
    const jobs: SchedulerJob[] = [];
    return { jobs, place: (job: SchedulerJob) => { jobs.push(job); } };
  };

  const act = (p: number, commits = 0.9): DivergenceAnswer => ({ none: p >= 0.5, p, commits });

  it("branches on two counted 'none' readings in a row at p >= 0.8, or one at p >= 0.97", async () => {
    const rigged = await atMill([act(0.85), act(0.1), act(0.85), act(0.9)]);
    const sink = placed();
    expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(false);
    await rigged.commit();
    expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(false);
    await rigged.commit();
    expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(false);
    await rigged.commit();
    expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(true);
    expect(sink.jobs.map((job) => job.reason)).toEqual(["living:branch:mill"]);
    const sure = await atMill([act(0.98)]);
    expect(await sure.coordinator.checkDivergence(sure.at(), placed().place)).toBe(true);
  });

  it("never branches on a single reading below the sure line, with or without a refusal (L2)", async () => {
    for (const refused of [null, "the player refused the prepared route"]) {
      const rigged = await atMill([act(0.76), act(0.96)], [], false, refused);
      const sink = placed();
      expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(false);
      expect(rigged.extras.living?.divergence?.streak).toBe(0);
      await rigged.commit();
      expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(false);
      expect(rigged.extras.living?.divergence?.streak).toBe(1);
      expect(sink.jobs).toEqual([]);
    }
  });

  it("reads each player turn once: a second reply to the same line asks nothing", async () => {
    const rigged = await atMill([act(0.9), act(0.9)]);
    const sink = placed();
    expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(false);
    await rigged.reply();
    expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(false);
    expect(rigged.judgeCalls.count).toBe(1);
    expect(rigged.extras.living?.divergence?.streak).toBe(1);
    await rigged.commit();
    expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(true);
  });

  it("a question-only or out-of-character line is not read, and a turn the judge says commits to nothing neither counts nor resets", async () => {
    const asked = await atMill([act(0.99)]);
    for (const line of ["\"What does the caravan job pay?\"", "*leans in* \"And who buys the rations?\"", "((OOC: brb))"]) {
      await asked.commit(line);
      expect(await asked.coordinator.checkDivergence(asked.at(), placed().place)).toBe(false);
    }
    expect(asked.judgeCalls.count).toBe(0);
    const rigged = await atMill([act(0.85), act(0.99, 0.1), act(0.85)]);
    const sink = placed();
    expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(false);
    await rigged.commit();
    expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(false);
    expect(rigged.extras.living?.divergence?.streak).toBe(1);
    await rigged.commit();
    expect(await rigged.coordinator.checkDivergence(rigged.at(), sink.place)).toBe(true);
  });

  interface GoldenTurn { text: string; readings: Array<{ none: boolean; p: number; commits?: number }> }
  const golden = (name: string): GoldenTurn[] => JSON.parse(readFileSync(join(process.cwd(), "test/goldens/live/living-divergence", `${name}.json`), "utf8")).turns;
  const replay = async (turns: GoldenTurn[], commitsWhenUnread: number) => {
    const answers = turns.flatMap((turn) => turn.readings.map((reading) => ({ none: reading.none, p: reading.p, commits: reading.commits ?? commitsWhenUnread })));
    const rigged = rig({ story: "living-hybrid", judge: answers, prefetch: false });
    const sink = placed();
    for (const turn of turns) {
      await rigged.commit(turn.text);
      for (let index = 0; index < Math.max(1, turn.readings.length); index += 1) {
        if (index > 0) await rigged.reply();
        await rigged.coordinator.checkDivergence(rigged.at(), sink.place);
      }
    }
    return sink.jobs.length;
  };

  it("live L3 goldens: 0 branches on both on-script runs, even if every turn were read as committing", async () => {
    for (const name of ["run1", "run2"]) {
      expect(await replay(golden(name), 0.9)).toBe(0);
      expect(await replay(golden(name).map((turn) => ({ ...turn, text: "I go on." })), 1)).toBe(0);
    }
  });

  it("live L3 goldens: the old rule branched on both runs", () => {
    const oldRule = (turns: GoldenTurn[]) => {
      let streak = 0;
      for (const reading of turns.flatMap((turn) => turn.readings)) {
        if (!reading.none || reading.p < 0.6) { streak = 0; continue; }
        if (reading.p >= 0.9 || ++streak >= 2) return true;
      }
      return false;
    };
    expect(oldRule(golden("run1"))).toBe(true);
    expect(oldRule(golden("run2"))).toBe(true);
  });

  it("a player who commits to walking away from every exit still branches", async () => {
    expect(await replay(golden("true-positive"), 0.9)).toBe(1);
  });

  it("on a living story the director leads: no divergence reading, no prefetch", async () => {
    const premise = rig({ answers: [answer(1)], judge: [act(0.99)] });
    await premise.coordinator.propose();
    await premise.commit();
    const story = premise.loaded.story;
    const activeId = premise.engine.serialize().activeCheckpointId;
    expect(directorLeads(story, activeId)).toBe(true);
    expect((story.outgoingByCheckpoint[activeId] ?? []).length).toBeGreaterThan(0);
    expect(premise.coordinator.prefetchDue()).toBe(false);
    expect(await premise.coordinator.checkDivergence(premise.at(), placed().place)).toBe(false);
    expect(premise.judgeCalls.count).toBe(0);
    const hybrid = rig({ story: "living-hybrid" });
    expect(directorLeads(hybrid.loaded.story, "mill")).toBe(false);
    expect(directorLeads(hybrid.loaded.story, "liv_1")).toBe(true);
    expect(followsPlayer(hybrid.loaded.story, "liv_b1_way")).toBe(true);
    expect(followsPlayer(hybrid.loaded.story, "mill")).toBe(false);
  });

  it("writes one branch from the current checkpoint that rejoins the next anchor, applied at a boundary, and never a second at the same checkpoint", async () => {
    const rigged = await atMill([{ none: true, p: 0.98, commits: 0.9 }, { none: true, p: 0.98, commits: 0.9 }], [answer(1, { name: "Into the Reeds", objective: "The miller's dog leads into the reeds, where a boat waits." })]);
    const sink = placed();
    expect(await rigged.coordinator.checkDivergence({ boundary: 1, messageId: 2 }, sink.place)).toBe(true);
    await sink.jobs[0].run?.();
    const proposal = rigged.extras.living?.proposals.at(-1);
    expect(proposal).toMatchObject({ kind: "branch", convergeTo: "ford", status: "accepted" });
    expect(rigged.calls.prompts[0]).toContain("The prepared ways forward the player is NOT taking");
    await rigged.commit();
    const story = rigged.loaded.story;
    expect(story.checkpointById.liv_b1_way).toMatchObject({ type: "intermediate", name: "Into the Reeds" });
    const branch = story.outgoingByCheckpoint.mill.find((transition) => transition.to === "liv_b1_way");
    expect(branch?.priority).toBeLessThan(story.outgoingByCheckpoint.mill.find((transition) => transition.to === "ford")?.priority ?? 0);
    expect(story.outgoingByCheckpoint.liv_b1_way[0].to).toBe("ford");
    expect(await rigged.coordinator.checkDivergence({ boundary: 2, messageId: 4 }, placed().place)).toBe(false);
  });

  it("drops a divergence reading that lands after the chat moved", async () => {
    const rigged = await atMill([{ none: true, p: 0.98, commits: 0.9 }]);
    const sink = placed();
    rigged.hooks.duringJudge = () => { rigged.context.chatId = "c2"; };
    expect(await rigged.coordinator.checkDivergence({ boundary: 1, messageId: 2 }, sink.place)).toBe(false);
    expect(rigged.extras.living?.divergence).toBeUndefined();
  });

  it("prefetch prepares one more way forward from the checkpoint the player is at, and it counts as that checkpoint's one branch", async () => {
    const off = await atMill([], [], false);
    expect(off.coordinator.prefetchDue()).toBe(false);
    const rigged = await atMill([{ none: true, p: 0.98, commits: 0.9 }], [answer(1, { name: "Along the Weir", objective: "The weir path along the millrace leads downstream." })]);
    expect(rigged.coordinator.prefetchDue()).toBe(true);
    const sink = placed();
    expect(rigged.coordinator.prefetch(sink.place)).toBe(true);
    expect(sink.jobs.map((job) => job.reason)).toEqual(["living:prefetch:mill"]);
    await sink.jobs[0].run?.();
    expect(rigged.calls.prompts[0]).toContain("yours must differ from every one of them");
    expect(rigged.extras.living?.proposals.at(-1)).toMatchObject({ kind: "branch", prepared: true, convergeTo: "ford", status: "accepted" });
    expect(rigged.coordinator.prefetchDue()).toBe(false);
    await rigged.commit();
    expect(rigged.loaded.story.checkpointById.liv_b1_way).toMatchObject({ name: "Along the Weir" });
    expect(rigged.coordinator.prefetchDue()).toBe(false);
    expect(await rigged.coordinator.checkDivergence({ boundary: 2, messageId: 4 }, placed().place)).toBe(false);
    expect(rigged.calls.journal).toContain("living director wrote another way forward");
  });

  it("a job placed in one chat writes nothing when it runs after a switch (L2: a prefetch from the previous chat)", async () => {
    const control = await atMill([], [answer(1, { name: "The Guildmaster's Office" })]);
    const controlSink = placed();
    expect(control.coordinator.prefetch(controlSink.place)).toBe(true);
    await controlSink.jobs[0].run?.();
    expect(control.extras.living?.proposals.at(-1)).toMatchObject({ kind: "branch", prepared: true });

    const rigged = await atMill([], [answer(1, { name: "The Guildmaster's Office" })]);
    const sink = placed();
    expect(rigged.coordinator.prefetch(sink.place)).toBe(true);
    rigged.context.chatId = "c2";
    await sink.jobs[0].run?.();
    expect(rigged.calls.prompts).toEqual([]);
    expect(rigged.extras.living?.proposals ?? []).toEqual([]);

    const branched = await atMill([{ none: true, p: 0.98, commits: 0.9 }], [answer(1)]);
    const branchSink = placed();
    expect(await branched.coordinator.checkDivergence(branched.at(), branchSink.place)).toBe(true);
    branched.context.chatId = "c2";
    await branchSink.jobs[0].run?.();
    expect(branched.calls.prompts).toEqual([]);

    const director = rig({ answers: [answer(1)] });
    const directorSink = placed();
    expect(director.coordinator.schedule(directorSink.place)).toBe(true);
    director.context.chatId = "c2";
    await directorSink.jobs[0].run?.();
    expect(director.calls.prompts).toEqual([]);
    expect(director.extras.living?.proposals ?? []).toEqual([]);
  });

  it("a prefetch job re-reads the switch when it runs: turned off after placing, it writes nothing", async () => {
    const options = { story: "living-hybrid", answers: [answer(1)], prefetch: true };
    const rigged = rig(options);
    await rigged.commit();
    const sink = placed();
    expect(rigged.coordinator.prefetch(sink.place)).toBe(true);
    options.prefetch = false;
    await sink.jobs[0].run?.();
    expect(rigged.calls.prompts).toEqual([]);
    expect(rigged.extras.living?.proposals ?? []).toEqual([]);
  });

  it("prefetch never prepares before the first reply, nor ahead of the checkpoint the player is at", async () => {
    const fresh = rig({ story: "living-hybrid" });
    expect(fresh.coordinator.prefetchDue()).toBe(false);
    const rigged = await atMill([]);
    rigged.set("ford_found", true);
    await rigged.commit();
    expect(rigged.engine.serialize().activeCheckpointId).toBe("ford");
    expect(rigged.coordinator.prefetchDue()).toBe(false);
  });

  it("a rollback that takes a branch back lets the checkpoint branch again", async () => {
    const rigged = await atMill([{ none: true, p: 0.98, commits: 0.9 }, { none: true, p: 0.98, commits: 0.9 }], [answer(1), answer(2)]);
    const sink = placed();
    await rigged.coordinator.checkDivergence({ boundary: 1, messageId: 2 }, sink.place);
    await sink.jobs[0].run?.();
    const applied = await rigged.commit();
    expect(rigged.loaded.story.checkpointById.liv_b1_way).toBeDefined();
    rigged.engine.rollbackTo(applied.boundary - 1);
    rigged.coordinator.restoreAfterRollback(applied.boundary - 1);
    expect(rigged.loaded.story.checkpointById.liv_b1_way).toBeUndefined();
    expect(rigged.extras.living?.divergence?.branchedFrom).toEqual([]);
    expect(graphEpoch(rigged.extras.living as LivingRuntimeState)).toMatch(/^\d+:0:-$/);
  });
});
