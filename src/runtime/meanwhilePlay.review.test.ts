import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, type BoundaryResult, type EngineState } from "@engine/index";
import type { SchedulerJob } from "@extraction/index";
import {
  createAgendaProposals, decideProposal, hasOpenAgenda, landAcceptedProposals, landedMeanwhile, MEANWHILE_MIN_GAP, meanwhileDue, recordMeanwhilePass,
  rollbackAgendaProposals, sanitizeAgendaProposals, type AgendaProposalsState, type MeanwhileAcceptMode, type MeanwhileProposal,
} from "./agendaProposals";
import { BOUNDARY_WORK, type BoundaryWorkContext } from "./boundaryWork";
import { lifeAuthorSlice } from "./lifeSnapshot";
import { createMeanwhilePort, type MeanwhileProposer } from "./meanwhilePort";
import { mintToken, tokenMatches, type RunContext } from "./runToken";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsModel";
import type { RuntimeExtras } from "./types";

jest.mock("@extraction/index", () => ({
  getChatWindow: (from: number, to: number) => ({ from, to, messages: [] }),
  planReconciliation: () => null,
  scheduleForcedCues: () => undefined,
}));

const STORY = parseStoryV2OrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")));

const engineState = (boundary: number, lastMessageId: number, values: Record<string, unknown> = {}) =>
  ({ boundary, lastMessageId, blackboard: { values, versions: {}, latched: {} } }) as unknown as EngineState;

const proposal = (id: string, to: number, boundary: number, patch: Partial<MeanwhileProposal> = {}): MeanwhileProposal => ({
  id, memberId: "arin", agendaId: "debt", text: `event ${id}`, public: false, reason: "proposed by the meanwhile curator",
  sourceWindow: { from: Math.max(0, to - 7), to }, boundary, status: "proposed", ...patch,
});

const rig = (options: { mode?: MeanwhileAcceptMode; attach?: boolean } = {}) => {
  const context: RunContext = { chatId: "c1", storyId: "character-life-lab", storyHash: "h1", sessionEpoch: 1, windowRevision: 0 };
  const extras = { stagecraft: { settings: { ...defaultGlobalSettings().stagecraft, meanwhileAcceptMode: options.mode ?? "review" } } } as unknown as RuntimeExtras;
  let state = engineState(10, 20);
  const calls = { injection: 0, persist: 0, notify: 0, journal: [] as string[], propose: 0, decide: [] as string[] };
  let moveDuringPersist = false;
  const proposer: MeanwhileProposer = {
    propose: async () => {
      calls.propose += 1;
      extras.agendaProposals = { ...(extras.agendaProposals ?? createAgendaProposals()), proposals: [...(extras.agendaProposals?.proposals ?? []), proposal(`p${calls.propose}`, state.lastMessageId, state.boundary)] };
      return { ok: true };
    },
    decide: async (id, status) => {
      calls.decide.push(`${id}:${status}`);
      const next = decideProposal(extras.agendaProposals ?? createAgendaProposals(), id, status);
      if (next) extras.agendaProposals = next;
      return Boolean(next);
    },
  };
  const port = createMeanwhilePort({
    getStory: () => STORY, getState: () => state, extras: () => extras,
    ownership: { mint: (window) => mintToken(context, window ?? null), check: (token) => tokenMatches(context, token) },
    updateInjection: () => { calls.injection += 1; },
    journal: (summary) => { calls.journal.push(summary); },
    persist: async () => { calls.persist += 1; if (moveDuringPersist) context.sessionEpoch += 1; },
    notify: () => { calls.notify += 1; },
  });
  if (options.attach !== false) port.attach(proposer);
  return { port, extras, calls, setState: (next: EngineState) => { state = next; }, moveDuringPersist: () => { moveDuringPersist = true; } };
};

const boundaryContext = (port: ReturnType<typeof createMeanwhilePort>, boundary: number, messageId: number, fired: boolean) => {
  const jobs: SchedulerJob[] = [];
  const context = {
    result: { boundary, fired: fired ? { id: "t" } : null, context: { lastMessageId: messageId } } as unknown as BoundaryResult,
    manager: { meanwhile: port },
    scheduler: { schedule: (job: SchedulerJob) => { jobs.push(job); } },
  } as unknown as BoundaryWorkContext;
  return { context, jobs };
};

const entry = (id: string) => {
  const found = BOUNDARY_WORK.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe("v2.8 agenda proposals in play: cadence", () => {
  const open = { mode: "review" as const, boundary: 10, openAgenda: true };

  it("is due on an open agenda with no pass yet, and never when off, with no open agenda, or while a proposal waits for the author", () => {
    expect(meanwhileDue(undefined, open)).toBe(true);
    expect(meanwhileDue(undefined, { ...open, mode: "off" })).toBe(false);
    expect(meanwhileDue(undefined, { ...open, openAgenda: false })).toBe(false);
    expect(meanwhileDue({ proposals: [proposal("a", 5, 3)], passes: [] }, open)).toBe(false);
    expect(meanwhileDue({ proposals: [proposal("a", 5, 3, { status: "rejected" })], passes: [] }, open)).toBe(true);
  });

  it("waits MEANWHILE_MIN_GAP boundaries after the last pass", () => {
    const state = recordMeanwhilePass(createAgendaProposals(), { boundary: 10, messageId: 20, reason: "checkpoint" });
    expect(meanwhileDue(state, { ...open, boundary: 10 + MEANWHILE_MIN_GAP - 1 })).toBe(false);
    expect(meanwhileDue(state, { ...open, boundary: 10 + MEANWHILE_MIN_GAP })).toBe(true);
  });

  it("the default install proposes and accepts automatically, and a stored mode outside auto/review/off falls back to it", () => {
    expect(defaultGlobalSettings().stagecraft.meanwhileAcceptMode).toBe("auto");
    expect(sanitizeGlobalSettings({ stagecraft: { meanwhileAcceptMode: "always" } }).stagecraft.meanwhileAcceptMode).toBe("auto");
    expect(sanitizeGlobalSettings({ stagecraft: { meanwhileAcceptMode: "review" } }).stagecraft.meanwhileAcceptMode).toBe("review");
    expect(sanitizeGlobalSettings({ stagecraft: { meanwhileAcceptMode: "off" } }).stagecraft.meanwhileAcceptMode).toBe("off");
  });

  it("the boundary work entry schedules one pass on a checkpoint change, records it, and none on an ordinary boundary", async () => {
    const run = rig();
    const work = entry("meanwhile-proposals");
    const quiet = boundaryContext(run.port, 10, 20, false);
    expect(work.when?.(quiet.context)).toBe(false);
    const fired = boundaryContext(run.port, 10, 20, true);
    expect(work.when?.(fired.context)).toBe(true);
    work.run(fired.context);
    expect(fired.jobs).toHaveLength(1);
    expect(fired.jobs[0]).toMatchObject({ priority: 4, reason: "meanwhile:checkpoint" });
    expect(run.extras.agendaProposals?.passes).toEqual([{ boundary: 10, messageId: 20, reason: "checkpoint" }]);
    expect(work.when?.(fired.context)).toBe(false);
    await fired.jobs[0].run?.();
    expect(run.calls.propose).toBe(1);
  });

  it("schedules nothing before the lazy coordinator is attached, and a job does not call the model once the author switched it off", async () => {
    const detached = rig({ attach: false });
    expect(detached.port.schedule("checkpoint", () => { throw new Error("placed"); })).toBe(false);
    const run = rig();
    const jobs: SchedulerJob[] = [];
    expect(run.port.schedule("scene-location", (job) => jobs.push(job))).toBe(true);
    run.extras.stagecraft.settings.meanwhileAcceptMode = "off";
    await jobs[0].run?.();
    expect(run.calls.propose).toBe(0);
    expect(run.port.schedule("scene-location", (job) => jobs.push(job))).toBe(false);
  });

  it("keeps proposing for a repeating last step, and stops once every step of a non-repeating agenda is done", () => {
    const done = { agenda_arin_debt_step: 99 };
    expect(hasOpenAgenda(STORY, done)).toBe(true);
    const raw = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8"));
    for (const member of raw.roster) for (const agenda of member.agenda ?? []) for (const item of agenda.steps) delete item.repeat;
    const finite = parseStoryV2OrThrow(raw);
    expect(hasOpenAgenda(finite, {})).toBe(true);
    expect(hasOpenAgenda(finite, done)).toBe(false);
    expect(hasOpenAgenda(null, {})).toBe(false);
  });
});

describe("v2.8 agenda proposals in play: propose only, applied at a boundary", () => {
  it("in auto mode a pass accepts its own proposals through the decide path, and they land at the next boundary", async () => {
    const run = rig({ mode: "auto" });
    const jobs: SchedulerJob[] = [];
    run.port.schedule("checkpoint", (job) => jobs.push(job));
    await jobs[0].run?.();
    expect(run.calls.decide).toEqual(["p1:accepted"]);
    expect(run.extras.agendaProposals?.proposals.map((entry) => entry.status)).toEqual(["accepted"]);
    expect(run.calls.injection).toBe(0);
    expect(await run.port.land({ boundary: 11, messageId: 22 })).toBe(1);
    expect(landedMeanwhile(run.extras.agendaProposals, "arin")).toHaveLength(1);
  });

  it("a pass stores proposals as proposed; nothing reaches a private block and no injection is refreshed", async () => {
    const run = rig();
    const jobs: SchedulerJob[] = [];
    run.port.schedule("checkpoint", (job) => jobs.push(job));
    await jobs[0].run?.();
    expect(run.extras.agendaProposals?.proposals.map((entry) => entry.status)).toEqual(["proposed"]);
    expect(await run.port.land({ boundary: 11, messageId: 22 })).toBe(0);
    expect(landedMeanwhile(run.extras.agendaProposals, "arin")).toEqual([]);
    expect(run.calls.injection).toBe(0);
  });

  it("an accepted proposal lands at the next boundary: one injection refresh, journaled, persisted, then notified", async () => {
    const run = rig();
    run.extras.agendaProposals = { proposals: [proposal("p", 20, 10)], passes: [] };
    expect(await run.port.decide("p", "accepted")).toBe(true);
    expect(landedMeanwhile(run.extras.agendaProposals, "arin")).toEqual([]);
    const { context } = boundaryContext(run.port, 11, 22, false);
    entry("meanwhile-land").run(context);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(run.extras.agendaProposals?.proposals[0]).toMatchObject({ status: "applied", appliedAt: { boundary: 11, messageId: 22 } });
    expect(landedMeanwhile(run.extras.agendaProposals, "arin")).toEqual(["event p"]);
    expect(run.calls).toMatchObject({ injection: 1, persist: 1, notify: 1 });
    expect(run.calls.journal).toEqual(["1 meanwhile event(s) landed"]);
    expect(await run.port.land({ boundary: 12, messageId: 24 })).toBe(0);
    expect(run.calls.persist).toBe(1);
  });

  it("lands before the scheduler and the reads at a boundary, after the game entry", () => {
    const order = (id: string) => entry(id).order;
    expect(order("game")).toBeLessThan(order("meanwhile-land"));
    expect(order("meanwhile-land")).toBeLessThan(order("scheduler-tick"));
    expect(order("stagecraft-curator")).toBeLessThan(order("meanwhile-proposals"));
  });

  it("a rejected proposal never lands", async () => {
    const run = rig();
    run.extras.agendaProposals = { proposals: [proposal("p", 20, 10)], passes: [] };
    await run.port.decide("p", "rejected");
    expect(await run.port.land({ boundary: 11, messageId: 22 })).toBe(0);
    expect(run.extras.agendaProposals.proposals[0].status).toBe("rejected");
  });

  it("does not notify when the chat moved during the persist (RunOwnership)", async () => {
    const run = rig();
    run.extras.agendaProposals = { proposals: [proposal("p", 20, 10, { status: "accepted" })], passes: [] };
    run.moveDuringPersist();
    await run.port.land({ boundary: 11, messageId: 22 });
    expect(run.calls.persist).toBe(1);
    expect(run.calls.notify).toBe(0);
  });

  it("control: notifies when the chat stayed", async () => {
    const run = rig();
    run.extras.agendaProposals = { proposals: [proposal("p", 20, 10, { status: "accepted" })], passes: [] };
    await run.port.land({ boundary: 11, messageId: 22 });
    expect(run.calls.notify).toBe(1);
  });
});

describe("v2.8 agenda proposals in play: rollback equals replay", () => {
  type Event = { kind: "boundary"; boundary: number; messageId: number; propose: boolean } | { kind: "decide"; status: "accepted" | "rejected" };

  const seeded = (seed: number) => {
    let value = seed;
    return () => {
      value = (value * 1103515245 + 12345) % 2147483648;
      return value / 2147483648;
    };
  };

  const events = (seed: number): Event[] => {
    const random = seeded(seed);
    const out: Event[] = [];
    let messageId = 1;
    for (let boundary = 1; boundary <= 30; boundary += 1) {
      messageId += 1 + Math.floor(random() * 2);
      out.push({ kind: "boundary", boundary, messageId, propose: random() < 0.4 });
      if (random() < 0.5) out.push({ kind: "decide", status: random() < 0.7 ? "accepted" : "rejected" });
    }
    return out;
  };

  const step = (state: AgendaProposalsState, event: Event): AgendaProposalsState => {
    if (event.kind === "decide") {
      const waiting = state.proposals.find((entry) => entry.status === "proposed");
      return waiting ? decideProposal(state, waiting.id, event.status) ?? state : state;
    }
    let next = landAcceptedProposals(state, { boundary: event.boundary, messageId: event.messageId });
    if (event.propose) {
      next = recordMeanwhilePass(next, { boundary: event.boundary, messageId: event.messageId, reason: "checkpoint" });
      next = { ...next, proposals: [...next.proposals, proposal(`b${event.boundary}`, event.messageId, event.boundary)] };
    }
    return next;
  };

  const run = (list: Event[]) => list.reduce(step, createAgendaProposals());

  const normalize = (state: AgendaProposalsState) => JSON.parse(JSON.stringify(state)) as AgendaProposalsState;

  for (const seed of [1, 7, 42, 2026]) {
    it(`seed ${seed}: rolling back to any message equals replaying the boundaries before it, the author's decisions kept`, () => {
      const list = events(seed);
      const full = run(list);
      const cuts = list.flatMap((event) => (event.kind === "boundary" ? [event.messageId, event.messageId + 1] : []));
      for (const cut of cuts) {
        const rolled = rollbackAgendaProposals(full, cut);
        const decided = new Map(full.proposals.filter((entry) => entry.status !== "proposed").map((entry) => [entry.id, entry.status === "rejected" ? "rejected" : "accepted"] as const));
        const prefix = list.filter((event) => event.kind === "boundary" && event.messageId < cut);
        let replay = run(prefix);
        replay = { ...replay, proposals: replay.proposals.map((entry) => {
          const status = decided.get(entry.id);
          return status && entry.status === "proposed" ? { ...entry, status } : entry;
        }) };
        replay = { ...replay, proposals: replay.proposals.map((entry) => {
          const landed = full.proposals.find((candidate) => candidate.id === entry.id)?.appliedAt;
          return entry.status === "accepted" && landed && landed.messageId < cut ? { ...entry, status: "applied" as const, appliedAt: landed } : entry;
        }) };
        expect(normalize(rolled)).toEqual(normalize(replay));
      }
    });
  }

  it("a reopen reads the same state back", () => {
    const full = run(events(42));
    expect(sanitizeAgendaProposals(JSON.parse(JSON.stringify(full)))).toEqual(normalize(full));
  });

  it("a swipe of the reply that landed a proposal takes the landing back and the next boundary lands it again", () => {
    const landed = landAcceptedProposals({ proposals: [proposal("p", 20, 10, { status: "accepted" })], passes: [] }, { boundary: 11, messageId: 22 });
    const rolled = rollbackAgendaProposals(landed, 22);
    expect(rolled.proposals[0].status).toBe("accepted");
    expect(rolled.proposals[0].appliedAt).toBeUndefined();
    expect(landedMeanwhile(rolled, "arin")).toEqual([]);
    expect(landedMeanwhile(landAcceptedProposals(rolled, { boundary: 11, messageId: 22 }), "arin")).toEqual(["event p"]);
  });
});

describe("v2.8 agenda proposals in play: player-clean", () => {
  it("the proposal ring is in the snapshot only in Author view", () => {
    const state = engineState(4, 9);
    const proposals = { proposals: [proposal("p", 9, 4), proposal("q", 9, 4, { status: "applied", appliedAt: { boundary: 5, messageId: 10 } })], passes: [] };
    expect(lifeAuthorSlice(STORY, state, false, proposals)).toBeNull();
    expect(lifeAuthorSlice(STORY, state, true, proposals)?.proposals).toHaveLength(2);
  });

  it("every new review control is under the player-forbidden life- prefix", () => {
    const source = readFileSync(join(process.cwd(), "src/components/drawer/CharacterLifePanel.tsx"), "utf8");
    const tags = [...source.matchAll(/data-so="([^"]+)"/g)].map((match) => match[1]);
    expect(tags).toEqual(expect.arrayContaining(["life-proposal-accept", "life-proposal-reject", "life-proposal-settled"]));
    expect(tags.filter((tag) => !tag.startsWith("life-"))).toEqual([]);
  });
});
