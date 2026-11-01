import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { InChatDiscovery, InChatView } from "@runtime/inChatTypes";
import type { WriteResult } from "@utils/writeResult";
import { BecauseRibbon } from "./BecauseRibbon";
import { ChatEndChips } from "./ChatEndChips";
import { DiscoveryCard } from "./DiscoveryCard";
import { GateMeter } from "./GateMeter";
import { SceneDivider } from "./SceneDivider";

export type InChatSlot = "between" | "after" | "meter" | "end";

export interface InChatHostPort {
  slot: (slot: InChatSlot, messageIds: number[]) => ReadonlyMap<number, HTMLElement>;
  onRebuild: (listener: () => void) => () => void;
}

export interface InChatActions {
  fill: (text: string) => WriteResult;
  openSheet: (tab: "people" | "ideas") => void;
}

export interface InChatLayerProps {
  view: InChatView;
  hosts: InChatHostPort;
  actions: InChatActions;
}

const SLOTS: readonly InChatSlot[] = ["between", "after", "meter", "end"];

type Targets = Record<InChatSlot, ReadonlyMap<number, HTMLElement>>;

const EMPTY_TARGETS: Targets = { between: new Map(), after: new Map(), meter: new Map(), end: new Map() };

const ids = (record: Record<number, unknown>) => Object.keys(record).map(Number);

export const slotIds = (view: InChatView): Record<InChatSlot, number[]> => ({
  between: view.player ? ids(view.dividers) : [],
  after: view.player ? [...new Set([...ids(view.because), ...ids(view.discovery)])].sort((a, b) => a - b) : [],
  meter: view.author ? ids(view.meter) : [],
  end: view.player && view.chips ? [view.chips.messageId] : [],
});

const cards = (items: InChatDiscovery[] | undefined, open: () => void) => (items ?? []).map((item) => <DiscoveryCard key={item.key} item={item} onOpen={open} />);

export const InChatLayer = ({ view, hosts, actions }: InChatLayerProps) => {
  const wanted = useMemo(() => slotIds(view), [view]);
  const key = SLOTS.map((slot) => `${slot}:${wanted[slot].join(",")}`).join("|");
  const [rebuilds, setRebuilds] = useState(0);
  const [targets, setTargets] = useState<Targets>(EMPTY_TARGETS);
  useEffect(() => hosts.onRebuild(() => setRebuilds((count) => count + 1)), [hosts]);
  useLayoutEffect(() => {
    setTargets(Object.fromEntries(key.split("|").map((part) => {
      const [slot, list] = part.split(":");
      return [slot, hosts.slot(slot as InChatSlot, list ? list.split(",").map(Number) : [])];
    })) as Targets);
  }, [hosts, key, rebuilds]);
  useEffect(() => () => { SLOTS.forEach((slot) => hosts.slot(slot, [])); }, [hosts]);
  const portal = (slot: InChatSlot, messageId: number, body: ReactNode) => {
    const host = targets[slot].get(messageId);
    return host ? createPortal(body, host, `${slot}:${messageId}:${host.id}`) : null;
  };
  const openPeople = () => actions.openSheet("people");
  const chips = view.chips;
  return (
    <>
      {wanted.between.map((messageId) => portal("between", messageId, <SceneDivider messageId={messageId} divider={view.dividers[messageId]} />))}
      {wanted.after.map((messageId) => portal("after", messageId, <>
        <BecauseRibbon messageId={messageId} lines={view.because[messageId] ?? []} />
        {cards(view.discovery[messageId], openPeople)}
      </>))}
      {wanted.meter.map((messageId) => portal("meter", messageId, <GateMeter messageId={messageId} meter={view.meter[messageId]} />))}
      {chips && wanted.end.map((messageId) => portal("end", messageId,
        <ChatEndChips key={messageId} chips={chips} fill={actions.fill} openIdeas={() => actions.openSheet("ideas")} />))}
    </>
  );
};

export default InChatLayer;
