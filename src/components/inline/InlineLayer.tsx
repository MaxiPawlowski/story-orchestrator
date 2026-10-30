import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { inlineMessageIds, visibleInlineItems, type InlineView } from "@runtime/inlineTimeline";
import type { InlinePresence } from "@runtime/presence";
import { InlineStrip } from "./InlineStrip";
import { ChapterCard } from "./ChapterCard";
import { RollChips } from "./RollChips";
import type { InlineActions } from "./InlineDetail";

export interface InlineHostPort {
  sync: (messageIds: number[]) => ReadonlyMap<number, HTMLElement>;
  onRebuild: (listener: () => void) => () => void;
}

export interface InlineLayerProps {
  view: InlineView;
  hosts: InlineHostPort;
  actions: InlineActions;
  presence?: InlinePresence;
}

const NO_PRESENCE: InlinePresence = { cards: {}, rolls: {} };

const presenceIds = (presence: InlinePresence) => [...Object.keys(presence.cards), ...Object.keys(presence.rolls)].map(Number);

export const InlineLayer = ({ view, hosts, actions, presence = NO_PRESENCE }: InlineLayerProps) => {
  const stripIds = useMemo(() => inlineMessageIds(view), [view]);
  const ids = useMemo(() => [...new Set([...stripIds, ...presenceIds(presence)])].sort((left, right) => left - right), [stripIds, presence]);
  const key = ids.join(",");
  const [rebuilds, setRebuilds] = useState(0);
  const [expansion, setExpansion] = useState<{ level: number; open: Record<number, boolean> }>({ level: view.level, open: {} });
  const expanded = expansion.level === view.level ? expansion.open : {};
  useEffect(() => hosts.onRebuild(() => setRebuilds((count) => count + 1)), [hosts]);
  const [targets, setTargets] = useState<ReadonlyMap<number, HTMLElement>>(() => new Map());
  useLayoutEffect(() => {
    setTargets(hosts.sync(key ? key.split(",").map(Number) : []));
  }, [hosts, key, rebuilds]);
  const toggle = (messageId: number) =>
    setExpansion((current) => {
      const open = current.level === view.level ? current.open : {};
      return { level: view.level, open: { ...open, [messageId]: !open[messageId] } };
    });
  return (
    <>
      {ids.map((messageId) => {
        const host = targets.get(messageId);
        if (!host) return null;
        return createPortal(
          <>
            {(presence.cards[messageId] ?? []).map((card) => <ChapterCard key={card.chapterId} card={card} />)}
            <InlineStrip
              messageId={messageId}
              items={visibleInlineItems(view, messageId)}
              level={view.level}
              expanded={expanded[messageId] === true}
              onToggle={() => toggle(messageId)}
              actions={actions}
            />
            <RollChips messageId={messageId} rolls={presence.rolls[messageId] ?? []} />
          </>,
          host,
          `${messageId}:${host.id}`,
        );
      })}
    </>
  );
};

export default InlineLayer;
