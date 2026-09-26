import { subscribeToHostEvents } from "@services/STAPI";
import { withholds } from "../generationLifecycle";
import { WitnessBook, filterUnwitnessed, presenceOf, type WitnessRow } from "./witnessFilter";

export interface WitnessFilterDeps {
  enabledNames: () => string[];
  drafted: () => string | null;
  chat: () => unknown[];
  isGroup: () => boolean;
  now: () => number;
}

export interface WitnessExportRow {
  index: number;
  speaker: string;
  text: string;
  presence: readonly string[] | null;
}

export interface WitnessDebug {
  setAuthored: (byIndex: Record<number, readonly string[]>) => number;
  clearAuthored: () => void;
  timings: () => number[];
  export: () => WitnessExportRow[];
}

const TIMING_RING = 500;

const isRow = (value: unknown): value is WitnessRow => typeof value === "object" && value !== null;

const rowAt = (chat: unknown[], index: number): WitnessRow | null => {
  const row = chat[index];
  return isRow(row) ? row : null;
};

const isRows = (chat: unknown[]): chat is WitnessRow[] => chat.every(isRow);

const extraOf = (row: WitnessRow | null): object | null => (typeof row?.extra === "object" && row.extra !== null ? row.extra : null);

export const startWitnessFilter = (deps: WitnessFilterDeps) => {
  const book = new WitnessBook();
  const timings: number[] = [];
  const recordAt = (messageId: unknown) => {
    const row = rowAt(deps.chat(), Number(messageId));
    const extra = extraOf(row);
    if (row && extra) book.record(extra, presenceOf(deps.enabledNames(), row));
  };
  const unsubscribe = subscribeToHostEvents([
    { eventName: "MESSAGE_SENT", handler: recordAt },
    { eventName: "MESSAGE_RECEIVED", handler: recordAt },
    { eventName: "CHARACTER_MESSAGE_RENDERED", handler: recordAt },
  ]);

  const intercept = (chat: unknown[], type: string) => {
    if (withholds(type) || !deps.isGroup() || !isRows(chat)) return;
    const drafted = deps.drafted();
    if (!drafted) return;
    const started = deps.now();
    filterUnwitnessed(chat, drafted, book.lookup, type === "continue");
    timings.push(deps.now() - started);
    if (timings.length > TIMING_RING) timings.shift();
  };

  const debug: WitnessDebug = {
    setAuthored: (byIndex) => Object.entries(byIndex).filter(([index, names]) => {
      const extra = extraOf(rowAt(deps.chat(), Number(index)));
      if (extra) book.author(extra, names);
      return Boolean(extra);
    }).length,
    clearAuthored: () => book.clearAuthored(),
    timings: () => [...timings],
    export: () => deps.chat().map((_, index) => {
      const row = rowAt(deps.chat(), index) ?? {};
      return { index, speaker: row.is_user === true ? "player" : String(row.name ?? ""), text: String(row.mes ?? ""), presence: book.presence(row) };
    }),
  };
  if (__SO_DEV__) globalThis.storyOrchestratorWitness = debug;

  return {
    intercept,
    dispose: () => {
      unsubscribe();
      if (__SO_DEV__ && globalThis.storyOrchestratorWitness === debug) globalThis.storyOrchestratorWitness = undefined;
    },
  };
};
