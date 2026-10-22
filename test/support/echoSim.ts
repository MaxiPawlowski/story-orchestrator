import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryOrThrow, type BoundaryLogEntry, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { closeLapsedEcho, createEchoes, rollbackEchoes, stepEchoes, type EchoCheckRecord, type EchoesState, type EchoRefusal, type EchoStepResult } from "@engine/life/echoes";
import { echoHold } from "@engine/echoSchema";

export type Values = Record<string, PrimitiveValue>;

export const ECHO_LAB_RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/delayed-echoes.story.json"), "utf8")) as Record<string, unknown>;

export const echoLab = (patch: Record<string, unknown> = {}): NormalizedStory => parseStoryOrThrow({ ...ECHO_LAB_RAW, ...patch });

export const ALL = ["mara", "tom", "narrator"];

export interface Turn {
  set?: Values;
  fire?: boolean;
  checks?: Array<[string, string]>;
  enabled?: string[];
  refuse?: Record<string, EchoRefusal>;
}

export interface SimRun {
  states: EchoesState[];
  results: EchoStepResult[];
  log: BoundaryLogEntry[];
  values: Values[];
}

const messageOf = (boundary: number) => boundary * 2;

export const entryOf = (story: NormalizedStory, boundary: number, before: Values, after: Values, fire: boolean): BoundaryLogEntry => ({
  at: boundary, boundary,
  before: { blackboard: { values: before } } as unknown as BoundaryLogEntry["before"],
  after: { blackboard: { values: after } } as unknown as BoundaryLogEntry["after"],
  fired: fire ? { ...story.transitions[0], declarationIndex: 0 } : null, source: "gate",
  context: { lastMessageId: messageOf(boundary) } as unknown as BoundaryLogEntry["context"],
  queue: { applied: [], discarded: [] } as unknown as BoundaryLogEntry["queue"], evaluated: null,
});

export interface SimOptions {
  lapse?: boolean;
  logCap?: number;
  checksComplete?: boolean;
  from?: { state: EchoesState; log: BoundaryLogEntry[]; values: Values; checks: EchoCheckRecord[] };
}

export function simulate(story: NormalizedStory, turns: readonly Turn[], options: SimOptions = {}): SimRun {
  const run: SimRun = { states: [], results: [], log: [...(options.from?.log ?? [])], values: [] };
  let state = options.from?.state ?? createEchoes();
  let values: Values = { ...(options.from?.values ?? {}) };
  const checks: EchoCheckRecord[] = [...(options.from?.checks ?? [])];
  const offset = run.log.at(-1)?.boundary ?? 0;
  turns.forEach((turn, index) => {
    const boundary = offset + index + 1;
    const before = values;
    values = { ...values, ...(turn.set ?? {}) };
    run.log.push(entryOf(story, boundary, before, values, Boolean(turn.fire)));
    while (run.log.length > (options.logCap ?? 200)) run.log.shift();
    (turn.checks ?? []).forEach(([checkId, outcome]) => checks.push({ checkId, boundary, outcome }));
    const at = { boundary, messageId: messageOf(boundary) };
    const result = stepEchoes({
      state, story, log: run.log, checks, checksComplete: options.checksComplete ?? true, values, at, chatId: "chat", storyId: "lab",
      enabled: turn.enabled ?? ALL, refuse: (_text, recipient) => turn.refuse?.[recipient] ?? null,
    });
    state = result.state;
    if (options.lapse) {
      state.events.filter((event) => event.status === "landed" && event.landedAt).forEach((event) => {
        const echo = story.echoes?.find((entry) => entry.id === event.echoId);
        if (echo && boundary > (event.landedAt?.boundary ?? 0) + echoHold(echo) - 1) state = closeLapsedEcho(state, event.offerId ?? "", at) ?? state;
      });
    }
    run.states.push(state);
    run.results.push(result);
    run.values.push(values);
  });
  return run;
}

export const rollbackAt = (run: SimRun, kept: number): EchoesState => rollbackEchoes(run.states[run.states.length - 1], messageOf(kept) + 1, kept);

export const stateAt = (run: SimRun, boundary: number): EchoesState => (boundary === 0 ? createEchoes() : run.states[boundary - 1]);
