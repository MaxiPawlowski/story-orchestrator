export const WORK_KEYS = ["generationStarted", "memberDrafted", "talkDecision", "loreSelect", "interceptor"] as const;

export type WorkKey = (typeof WORK_KEYS)[number];

export type ProbeEvent =
  | { kind: "sent"; messageId: number }
  | { kind: "drafted"; member: string }
  | { kind: "started"; type: string; dryRun: boolean }
  | { kind: "tool"; messageId: number }
  | { kind: "rendered"; messageId: number; type: string }
  | { kind: "work"; work: WorkKey };

export interface ProbeBoundary {
  boundary: number;
  messageId: number;
}

export interface ChainCounts {
  generations: number;
  toolCalls: number;
  renders: number;
  boundaries: number;
  work: Record<WorkKey, number>;
}

export interface DraftReport extends ChainCounts {
  member: string | null;
  firstMessageId: number | null;
  lastMessageId: number | null;
}

export interface TurnReport extends ChainCounts {
  userMessageId: number;
  drafts: DraftReport[];
}

export interface ToolTurnReport {
  turns: TurnReport[];
  summary: {
    turns: number;
    boundariesPerTurn: number[];
    maxBoundariesPerDraft: number;
    maxGenerationsPerDraft: number;
    maxWorkPerDraft: Record<WorkKey, number>;
    talkDecisions: number;
    foldNeeded: boolean;
  };
}

const MARKERS: ReadonlySet<ProbeEvent["kind"]> = new Set(["sent", "drafted", "started"]);

const counts = (): ChainCounts => ({ generations: 0, toolCalls: 0, renders: 0, boundaries: 0, work: Object.fromEntries(WORK_KEYS.map((key) => [key, 0])) as Record<WorkKey, number> });

export const markersFirst = (events: readonly ProbeEvent[]): ProbeEvent[] => {
  const out: ProbeEvent[] = [];
  let workSince = 0;
  for (const event of events) {
    if (MARKERS.has(event.kind)) out.splice(workSince, 0, event);
    else out.push(event);
    if (event.kind !== "work") workSince = out.length;
  }
  return out;
};

const touch = (draft: DraftReport, messageId: number) => {
  draft.firstMessageId = draft.firstMessageId === null ? messageId : Math.min(draft.firstMessageId, messageId);
  draft.lastMessageId = draft.lastMessageId === null ? messageId : Math.max(draft.lastMessageId, messageId);
};

const tally = (targets: ChainCounts[], event: ProbeEvent) => {
  for (const target of targets) {
    if (event.kind === "started" && !event.dryRun) target.generations += 1;
    if (event.kind === "tool") target.toolCalls += 1;
    if (event.kind === "rendered") target.renders += 1;
    if (event.kind === "work") target.work[event.work] += 1;
  }
};

const segment = (events: readonly ProbeEvent[]): TurnReport[] => {
  const turns: TurnReport[] = [];
  for (const event of markersFirst(events)) {
    if (event.kind === "sent") {
      turns.push({ ...counts(), userMessageId: event.messageId, drafts: [] });
      continue;
    }
    const turn = turns[turns.length - 1];
    if (!turn) continue;
    if (event.kind === "drafted" || (event.kind === "started" && !event.dryRun && turn.drafts.length === 0)) {
      turn.drafts.push({ ...counts(), member: event.kind === "drafted" ? event.member : null, firstMessageId: null, lastMessageId: null });
    }
    const draft = turn.drafts[turn.drafts.length - 1];
    tally(draft ? [turn, draft] : [turn], event);
    if (draft && (event.kind === "tool" || event.kind === "rendered")) touch(draft, event.messageId);
  }
  return turns;
};

const attribute = (turns: TurnReport[], boundaries: readonly ProbeBoundary[]) => {
  for (const boundary of boundaries) {
    const turn = [...turns].reverse().find((candidate) => candidate.userMessageId <= boundary.messageId);
    if (!turn) continue;
    turn.boundaries += 1;
    const draft = turn.drafts.find((candidate) => candidate.firstMessageId !== null && candidate.lastMessageId !== null
      && candidate.firstMessageId <= boundary.messageId && boundary.messageId <= candidate.lastMessageId);
    if (draft) draft.boundaries += 1;
  }
};

export const summarizeToolTurns = (events: readonly ProbeEvent[], boundaries: readonly ProbeBoundary[], talkDecisions: number): ToolTurnReport => {
  const turns = segment(events);
  attribute(turns, boundaries);
  const drafts = turns.flatMap((turn) => turn.drafts);
  const maxOf = (pick: (draft: DraftReport) => number) => drafts.reduce((max, draft) => Math.max(max, pick(draft)), 0);
  const maxWorkPerDraft = Object.fromEntries(WORK_KEYS.map((key) => [key, maxOf((draft) => draft.work[key])])) as Record<WorkKey, number>;
  const maxBoundariesPerDraft = maxOf((draft) => draft.boundaries);
  return {
    turns,
    summary: {
      turns: turns.length,
      boundariesPerTurn: turns.map((turn) => turn.boundaries),
      maxBoundariesPerDraft,
      maxGenerationsPerDraft: maxOf((draft) => draft.generations),
      maxWorkPerDraft,
      talkDecisions,
      foldNeeded: maxBoundariesPerDraft > 1 || WORK_KEYS.some((key) => maxWorkPerDraft[key] > 1),
    },
  };
};
