import { subscribeToHostEvents, type HostEventName } from "./events";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export const INLINE_HOST_PREFIX = "so-inline-";
export const INLINE_HOST_CLASS = "so-inline-host";
export const SLOT_HOST_CLASS = "so-slot";
export const SLOT_HOST_PREFIX = "so-slot-";
const ATTACH_SAMPLES = 50;

export const MESSAGE_SLOTS = ["between", "name", "above", "after", "below", "meter", "end"] as const;
export type MessageSlot = (typeof MESSAGE_SLOTS)[number];

const TRAILING: readonly MessageSlot[] = ["after", "below", "meter", "end"];

const REATTACH_EVENTS: HostEventName[] = [
  "CHARACTER_MESSAGE_RENDERED", "USER_MESSAGE_RENDERED", "MESSAGE_UPDATED", "MESSAGE_DELETED", "MESSAGE_SWIPED",
  "MORE_MESSAGES_LOADED", "CHAT_CHANGED",
];

export interface InlineHostSet {
  sync: (messageIds: number[]) => ReadonlyMap<number, HTMLElement>;
  slot: (slot: MessageSlot, messageIds: number[]) => ReadonlyMap<number, HTMLElement>;
  onRebuild: (listener: () => void) => () => void;
  attachTimes: () => number[];
  dispose: () => void;
}

export const slotHostId = (slot: MessageSlot, messageId: number): string =>
  (slot === "below" ? `${INLINE_HOST_PREFIX}${messageId}` : `${SLOT_HOST_PREFIX}${slot}-${messageId}`);

const mesIdOf = (host: Element): string | null => host.closest(".mes")?.getAttribute("mesid") ?? null;

const isMessage = (node: Node): boolean => node instanceof Element && node.classList.contains("mes");

const nameRow = (block: Element): Element | null => block.querySelector(":scope > .ch_name .name_text")?.parentElement ?? null;

const place = (block: Element, slot: MessageSlot, host: HTMLElement): boolean => {
  if (slot === "between") {
    block.insertBefore(host, block.firstChild);
    return true;
  }
  if (slot === "name") {
    const row = nameRow(block);
    row?.appendChild(host);
    return Boolean(row);
  }
  if (slot === "above") {
    const name = block.querySelector(":scope > .ch_name");
    if (name) name.after(host);
    else block.insertBefore(host, block.firstChild);
    return true;
  }
  const rank = TRAILING.indexOf(slot);
  const later = Array.from(block.children).find((child) => child instanceof HTMLElement && child.classList.contains(SLOT_HOST_CLASS)
    && TRAILING.indexOf(child.dataset.slot as MessageSlot) > rank);
  block.insertBefore(host, later ?? null);
  return true;
};

const placedRight = (host: HTMLElement, block: Element, slot: MessageSlot): boolean =>
  (slot === "name" ? host.parentElement === nameRow(block) : host.parentElement === block);

export function mountInlineHosts(root: ParentNode = document): WriteResult<{ hosts: InlineHostSet }> {
  const chat = root.querySelector("#chat");
  if (!chat) return couldNot("the chat is not on the page");
  const listeners = new Set<() => void>();
  const pendingSince: number[] = [];
  const samples: number[] = [];
  let scheduled = false;

  const sample = () => {
    const now = performance.now();
    while (pendingSince.length) samples.push(now - (pendingSince.shift() ?? now));
    samples.splice(0, Math.max(0, samples.length - ATTACH_SAMPLES));
  };

  const slot = (name: MessageSlot, messageIds: number[]) => {
    const wanted = new Set(messageIds);
    for (const host of Array.from(chat.querySelectorAll<HTMLElement>(`.${SLOT_HOST_CLASS}[data-slot="${name}"]`))) {
      const messageId = Number(host.dataset.mesid);
      const block = host.closest(".mes_block");
      if (!wanted.has(messageId) || mesIdOf(host) !== String(messageId) || !block || !placedRight(host, block, name)) host.remove();
    }
    const hosts = new Map<number, HTMLElement>();
    for (const messageId of wanted) {
      const block = chat.querySelector(`.mes[mesid="${messageId}"] .mes_block`);
      if (!block) continue;
      const id = slotHostId(name, messageId);
      let host = block.querySelector<HTMLElement>(`.${SLOT_HOST_CLASS}[data-slot="${name}"]`);
      if (!host) {
        host = document.createElement("div");
        host.id = id;
        host.className = name === "below" ? `${INLINE_HOST_CLASS} ${SLOT_HOST_CLASS}` : `${SLOT_HOST_CLASS} so-slot-${name}`;
        host.dataset.slot = name;
        host.dataset.mesid = String(messageId);
        if (!place(block, name, host)) continue;
      }
      hosts.set(messageId, host);
    }
    sample();
    return hosts;
  };

  const rebuild = () => {
    pendingSince.push(performance.now());
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      listeners.forEach((listener) => listener());
    });
  };

  const unsubscribe = subscribeToHostEvents(REATTACH_EVENTS.map((eventName) => ({ eventName, handler: rebuild })));
  const observer = typeof MutationObserver === "function"
    ? new MutationObserver((records) => {
      if (records.some((record) => [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(isMessage))) rebuild();
    })
    : null;
  observer?.observe(chat, { childList: true });

  return wrote({
    hosts: {
      sync: (messageIds) => slot("below", messageIds),
      slot,
      onRebuild: (listener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
      attachTimes: () => [...samples],
      dispose: () => {
        unsubscribe();
        observer?.disconnect();
        listeners.clear();
        chat.querySelectorAll(`.${SLOT_HOST_CLASS}`).forEach((host) => host.remove());
      },
    },
  });
}
