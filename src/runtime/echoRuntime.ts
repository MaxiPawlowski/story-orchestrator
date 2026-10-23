import type { BoundaryLogEntry, BoundaryResult, NormalizedStory, PrimitiveValue } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";
import type { EchoAt, EchoRefusal } from "@engine/life/echoes";
import type { EchoAuthorView } from "@engine/life/echoView";
import type { OfferCandidate, OfferContext, OfferLapse, OfferReceipt } from "@engine/life/offers";
import type { RuntimeExtras } from "./types";

type Values = Readonly<Record<string, PrimitiveValue>>;

export interface EchoRuntimeDeps {
  story: () => NormalizedStory | null;
  storyId: () => string | undefined;
  log: () => readonly BoundaryLogEntry[];
  values: () => Values | null;
  extras: () => RuntimeExtras;
  chatId: () => string | null;
  enabledIds: () => string[];
  enabled: () => boolean;
  refuses: (text: string, rosterId: string | null) => boolean;
  receipts: () => readonly OfferReceipt[];
  historyFloor: () => number | null;
  persist: () => void;
  notify: () => void;
  journal: (summary: string, note: string) => void;
}

export const ECHO_CHECKS_KEPT = 100;

export function createEchoRuntime(deps: EchoRuntimeDeps) {
  const kit = () => gameLayer()?.echoes ?? null;
  const relevant = (story: NormalizedStory | null) => Boolean(story?.echoes?.length && deps.enabled() && kit());
  const values = (): Values => deps.values() ?? {};
  const refuse = (story: NormalizedStory) => (text: string, recipient: string): EchoRefusal | null => {
    if (deps.refuses(text, recipient)) return "secret";
    if (story.roster.find((member) => member.id === recipient)?.view !== "omniscient") return null;
    if (deps.refuses(text, null)) return "secret";
    return gameLayer()?.cues.namesUnknownEntity(story, values(), deps.enabledIds(), text) ? "unknown-name" : null;
  };
  const now = (): EchoAt => {
    const last = deps.log().at(-1);
    return { boundary: last?.boundary ?? 0, messageId: last?.context.lastMessageId ?? -1 };
  };
  const checks = () => (deps.extras().checks?.records ?? []).map((record) => ({ checkId: record.checkId, boundary: record.boundary, outcome: String(record.outcome) }));
  return {
    relevant: () => relevant(deps.story()),
    provider: (ctx: OfferContext): OfferCandidate[] => (relevant(ctx.story) ? kit()?.echoCandidates(ctx.story, deps.extras().echoes, ctx.recipient) ?? [] : []),
    onLapse(lapse: OfferLapse) {
      const state = deps.extras().echoes;
      if (lapse.source.kind !== "echo" || !state) return;
      const next = kit()?.closeLapsedEcho(state, lapse.key, now());
      if (!next) return;
      deps.extras().echoes = next;
      deps.journal("echo lapsed", `${lapse.source.echoId}: offered to ${lapse.recipient} but never used before its hold ended (${lapse.reason})`);
    },
    onBoundary(result: BoundaryResult) {
      const story = deps.story();
      const layer = kit();
      const chatId = deps.chatId();
      if (!story || !layer || !chatId || !relevant(story)) return;
      const records = checks();
      const step = layer.stepEchoes({
        state: deps.extras().echoes ?? layer.createEchoes(), story, log: deps.log(), checks: records, checksComplete: records.length < ECHO_CHECKS_KEPT, values: values(),
        at: { boundary: result.boundary, messageId: result.context.lastMessageId }, chatId, storyId: deps.storyId() ?? story.id ?? "", enabled: deps.enabledIds(),
        refuse: refuse(story), horizonMessageId: deps.historyFloor(),
      });
      deps.extras().echoes = step.state;
      const line = layer.echoJournal(step);
      if (!line) return;
      deps.journal(line.summary, line.note);
      deps.persist();
      deps.notify();
    },
    authorView(authorView: boolean): EchoAuthorView | null {
      const story = deps.story();
      const layer = kit();
      if (!authorView || !story || !layer || !relevant(story)) return null;
      const clock = layer.storyClock(story, values());
      return layer.echoAuthorView({ story, state: deps.extras().echoes, values: values(), at: now(), clock, enabled: deps.enabledIds(), refuse: refuse(story), receipts: deps.receipts() });
    },
  };
}

export type EchoRuntime = ReturnType<typeof createEchoRuntime>;
