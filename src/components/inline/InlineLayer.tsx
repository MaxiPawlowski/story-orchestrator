import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { inlineMessageIds, visibleInlineItems, type InlineView } from "@runtime/inlineTimeline";
import type { InlineCategory } from "@runtime/settingsModel";
import { InlineStrip } from "./InlineStrip";
import type { InlineActions } from "./InlineDetail";

export interface InlineHostPort {
  sync: (messageIds: number[]) => ReadonlyMap<number, HTMLElement>;
  onRebuild: (listener: () => void) => () => void;
}

export interface InlineLayerProps {
  view: InlineView;
  hosts: InlineHostPort;
  actions: InlineActions;
}

export const InlineLayer = ({ view, hosts, actions }: InlineLayerProps) => {
  const ids = useMemo(() => inlineMessageIds(view), [view]);
  const key = ids.join(",");
  const [rebuilds, setRebuilds] = useState(0);
  const [expanded, setExpanded] = useState<Record<number, InlineCategory | null>>({});
  useEffect(() => hosts.onRebuild(() => setRebuilds((count) => count + 1)), [hosts]);
  const [targets, setTargets] = useState<ReadonlyMap<number, HTMLElement>>(() => new Map());
  useLayoutEffect(() => {
    setTargets(hosts.sync(key ? key.split(",").map(Number) : []));
  }, [hosts, key, rebuilds]);
  const toggle = (messageId: number, category: InlineCategory) =>
    setExpanded((current) => ({ ...current, [messageId]: current[messageId] === category ? null : category }));
  return (
    <>
      {ids.map((messageId) => {
        const host = targets.get(messageId);
        if (!host) return null;
        return createPortal(
          <InlineStrip
            messageId={messageId}
            items={visibleInlineItems(view, messageId)}
            level={view.level}
            expanded={expanded[messageId] ?? null}
            onToggle={(category) => toggle(messageId, category)}
            actions={actions}
          />,
          host,
          `${messageId}:${host.id}`,
        );
      })}
    </>
  );
};

export default InlineLayer;
