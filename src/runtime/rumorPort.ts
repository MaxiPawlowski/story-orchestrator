import type { BoundaryResult, NormalizedStory, PrimitiveValue } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";
import { heldSecrets, keptFrom } from "@memory/heldSecrets";
import type { EpistemicEntry } from "@memory/types";
import type { SourceRevision } from "@memory/audience";
import { createRumors } from "@memory/rumors/state";
import type { RumorsState } from "@memory/rumors/types";
import type { RumorAuthorRow } from "@memory/rumors/lines";
import { nameForRosterId, namesForRosterId } from "./roster";
import type { RuntimeExtras } from "./types";

declare module "./types" {
  interface RuntimeExtras {
    rumors?: RumorsState;
  }
  interface RuntimeSnapshot {
    rumorsAuthor?: RumorAuthorRow[] | null;
  }
}

export interface RumorPortDeps {
  getStory: () => NormalizedStory | null;
  values: () => Readonly<Record<string, PrimitiveValue>> | null;
  extras: () => RuntimeExtras;
  chatId: () => string | null;
  storyId: () => string | undefined;
  enabledIds: () => string[];
  revisionAt: (messageId: number) => SourceRevision | null;
  historyFloor: () => number | null;
  epistemic: () => EpistemicEntry[];
  refresh: () => void;
  heldKey: () => string;
  resync: () => void;
  persist: () => void;
  notify: () => void;
  journal: (summary: string, note: string) => void;
}

export function createRumorPort(deps: RumorPortDeps) {
  const state = () => deps.extras().rumors ?? createRumors();
  const enabled = () => Boolean(deps.getStory()?.rumorNet) && deps.extras().memory.settings.rumors !== false;
  const nameOf = (id: string) => nameForRosterId(deps.getStory(), id);
  const secretFor = (story: NormalizedStory) => {
    const disclosures = state().disclosures.map((entry) => ({ entryId: entry.entryId, names: namesForRosterId(story, entry.member) }));
    const secrets = heldSecrets(deps.epistemic(), story.roster.flatMap((member) => namesForRosterId(story, member.id)), disclosures);
    return (text: string, member: string) => {
      const barred = secrets.filter((secret) => keptFrom(text, [secret], namesForRosterId(story, member)));
      return { barred: barred.length > 0, entryIds: barred.flatMap((secret) => (secret.entryId ? [secret.entryId] : [])) };
    };
  };
  return {
    enabled,
    state,
    disclosures: () => (enabled() ? state().disclosures : []),
    lines: (rosterId: string): string[] => (enabled() ? gameLayer()?.rumors.hearsayLines(state(), rosterId, nameOf) ?? [] : []),
    authorRows: (): RumorAuthorRow[] | null => {
      const story = deps.getStory();
      return enabled() && story && deps.extras().ui.authorView ? gameLayer()?.rumors.rumorAuthorRows(state(), story.rumorNet, nameOf) ?? null : null;
    },
    onBoundary(result: BoundaryResult) {
      const story = deps.getStory();
      const layer = gameLayer();
      const values = deps.values();
      const chatId = deps.chatId();
      if (!enabled() || !story?.rumorNet || !layer || !values || !chatId) return;
      const at = { boundary: result.boundary, messageId: result.context.lastMessageId };
      const spread = layer.rumors.spreadRumors({
        state: state(), net: story.rumorNet, life: story.life?.members ?? [], values, at, chatId, storyId: deps.storyId() ?? story.id ?? "",
        enabled: deps.enabledIds(), secretFor: secretFor(story), revision: deps.revisionAt(at.messageId), horizonMessageId: deps.historyFloor(),
      });
      const before = state();
      if (!spread.started.length && !spread.scheduled.length && !spread.landed.length && spread.state.events.length === before.events.length
        && spread.state.hearsay.length === before.hearsay.length) return;
      const held = deps.heldKey();
      deps.extras().rumors = spread.state;
      if (spread.landed.length) deps.refresh();
      if (spread.disclosed.length && deps.heldKey() !== held) deps.resync();
      if (spread.landed.length) {
        deps.journal(`${spread.landed.length} rumor hop(s) landed${spread.held.length ? `, ${spread.held.length} held back` : ""}`,
          [...spread.landed.map((event) => `${event.rumorId}: ${nameOf(event.from)} -> ${nameOf(event.to)}${event.leak ? " (leak)" : ""}`),
            ...spread.held.map((event) => `${event.rumorId}: ${nameOf(event.from)} -> ${nameOf(event.to)} held: the claim restates a secret kept from them`)].join("\n"));
      }
      deps.persist();
      deps.notify();
    },
  };
}

export const rumorAuthorSlice = (story: NormalizedStory | null, extras: Pick<RuntimeExtras, "rumors" | "memory" | "ui">): RumorAuthorRow[] | null =>
  (story?.rumorNet && extras.ui.authorView && extras.memory.settings.rumors !== false
    ? gameLayer()?.rumors.rumorAuthorRows(extras.rumors, story.rumorNet, (id) => nameForRosterId(story, id)) ?? null : null);

export const rumorRevision = (rows: ReadonlyArray<{ text: string; swipeId?: number }>, hash: (text: string) => string): SourceRevision | null =>
  (rows[0] ? { swipeId: rows[0].swipeId ?? null, hash: hash(rows[0].text) } : null);
