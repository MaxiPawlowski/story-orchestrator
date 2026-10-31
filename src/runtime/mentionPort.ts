import type { BoundaryResult, NormalizedStory } from "@engine/index";
import { createMentions, recordMentions, usedInReply, type MentionsState, type OfferedItem, type StampAt } from "@memory/index";
import { namesForRosterId, rosterIdForName } from "./roster";
import type { RuntimeExtras } from "./types";
import { messageRevision } from "./yourMove";

declare module "./types" {
  interface RuntimeExtras {
    mentions?: MentionsState;
  }
}

export interface MentionPortDeps {
  getStory: () => NormalizedStory | null;
  extras: () => RuntimeExtras;
  chatRows: () => unknown[];
  offeredTo: (rosterId: string, messageId: number) => OfferedItem[] | null;
  stampUsed: (ids: string[], at: StampAt) => void;
  refresh: () => void;
  persist: () => void;
}

export interface MentionPort {
  held: () => MentionsState | null;
  onBoundary: (result: BoundaryResult) => void;
}

interface ReplyRow {
  mes?: unknown;
  name?: unknown;
  is_user?: unknown;
  is_system?: unknown;
}

export function createMentionPort(deps: MentionPortDeps): MentionPort {
  const settings = () => deps.extras().memory.settings;
  const ledgerOn = () => settings().mentionLedger !== false;
  const retentionOn = () => settings().strengthRetention !== false;
  return {
    held: () => (ledgerOn() ? deps.extras().mentions ?? null : null),
    onBoundary: (result) => {
      const story = deps.getStory();
      if (!story || !settings().enabled || (!ledgerOn() && !retentionOn())) return;
      const messageId = result.context.lastMessageId;
      const row = deps.chatRows()[messageId] as ReplyRow | undefined;
      if (!row || row.is_user === true || row.is_system === true || typeof row.mes !== "string" || typeof row.name !== "string") return;
      const rosterId = rosterIdForName(story, row.name);
      const offered = rosterId ? deps.offeredTo(rosterId, messageId) : null;
      if (!rosterId || !offered?.length) return;
      const ids = usedInReply(offered, row.mes, namesForRosterId(story, rosterId));
      const revision = messageRevision(row);
      const at = { member: rosterId, messageId, revision: revision ? `${revision.swipeId ?? "-"}.${revision.hash}` : "", boundary: result.boundary };
      const extras = deps.extras();
      const before = extras.mentions ?? createMentions();
      extras.mentions = recordMentions(before, ids, offered, at);
      const rows = new Set(offered.filter((item) => item.kind === "row").map((item) => item.id));
      if (retentionOn()) deps.stampUsed(ids.filter((id) => rows.has(id)), { messageId, boundary: result.boundary });
      if (!ids.length && before.records.length === extras.mentions.records.length) return;
      deps.refresh();
      deps.persist();
    },
  };
}
