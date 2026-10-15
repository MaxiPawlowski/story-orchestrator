import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import type { SharedReadAudit, SharedReadWindow } from "@extraction/index";
import type { ParsedArcSignal } from "@memory/index";
import { unknownAudience, type SpanAudienceOf } from "@memory/audience";
import { createPromises, openPromiseRefs, openRows, promiseHooks } from "@memory/promises/state";
import type { OpenPromiseRef, PromisesState } from "@memory/promises/types";
import type { PROMISE_PORT_IMPL } from "./promisePortImpl";
import { nameForRosterId } from "./roster";
import type { RuntimeExtras } from "./types";

export interface PromisePortDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  extras: () => RuntimeExtras;
  chatId: () => string | null;
  storyId: () => string | undefined;
  chatWindow: (from: number, to: number) => SharedReadWindow;
  chatRows: () => unknown[];
  historyFloor: () => number | null;
  playerName: () => string;
  journal: (summary: string, note: string) => void;
  refresh: () => void;
  audience?: SpanAudienceOf;
}

export interface PromisePort {
  enabled: () => boolean;
  open: () => OpenPromiseRef[] | null;
  ready: (audit: SharedReadAudit) => Promise<unknown>;
  apply: (audit: SharedReadAudit, arcs: ParsedArcSignal[]) => ParsedArcSignal[];
  reminder: (rosterId: string) => string[];
  hooks: () => string[];
  state: () => PromisesState;
}

type PortImpl = typeof PROMISE_PORT_IMPL;

let impl: PortImpl | null = null;
let loading: Promise<PortImpl> | null = null;

export const installPromisePortImpl = (next: PortImpl): void => {
  impl = next;
};

const loadImpl = (): Promise<PortImpl> => (impl ? Promise.resolve(impl) : (loading ??= import("./promisePortImpl").then(({ PROMISE_PORT_IMPL }) => {
  installPromisePortImpl(PROMISE_PORT_IMPL);
  return PROMISE_PORT_IMPL;
})));

export function createPromisePort(deps: PromisePortDeps): PromisePort {
  const state = () => deps.extras().promises ?? createPromises();
  const enabled = () => Boolean(deps.getStory()) && deps.extras().memory.settings.promises !== false;
  const nameOf = (id: string) => nameForRosterId(deps.getStory(), id);
  return {
    enabled,
    state,
    open: () => (enabled() ? openPromiseRefs(state(), nameOf) : null),
    ready: (audit) => (enabled() && (audit.promiseLines?.length || openRows(state()).length) ? loadImpl() : Promise.resolve(null)),
    apply: (audit, arcs) => (impl && enabled() ? impl.apply(deps, audit, arcs) : arcs),
    reminder: (rosterId) => {
      if (!enabled() || !state().rows.some((row) => row.promisee === rosterId)) return [];
      if (impl) return impl.reminder(deps, rosterId);
      void loadImpl().then(() => deps.refresh(), () => undefined);
      return [];
    },
    hooks: () => (enabled() ? promiseHooks(state(), deps.audience ?? unknownAudience, nameOf) : []),
  };
}
