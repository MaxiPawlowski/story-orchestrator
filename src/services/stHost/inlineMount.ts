import { subscribeToHostEvents, type HostEventName } from "./events";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export const INLINE_HOST_PREFIX = "so-inline-";
export const INLINE_HOST_CLASS = "so-inline-host";
const ATTACH_SAMPLES = 50;

const REATTACH_EVENTS: HostEventName[] = [
  "CHARACTER_MESSAGE_RENDERED", "USER_MESSAGE_RENDERED", "MESSAGE_UPDATED", "MESSAGE_DELETED", "MESSAGE_SWIPED",
  "MORE_MESSAGES_LOADED", "CHAT_CHANGED",
];

export interface InlineHostSet {
  sync: (messageIds: number[]) => ReadonlyMap<number, HTMLElement>;
  onRebuild: (listener: () => void) => () => void;
  attachTimes: () => number[];
  dispose: () => void;
}

const hostIdFor = (messageId: number) => `${INLINE_HOST_PREFIX}${messageId}`;

const mesIdOf = (host: Element): string | null => host.closest(".mes")?.getAttribute("mesid") ?? null;

export function mountInlineHosts(root: ParentNode = document): WriteResult<{ hosts: InlineHostSet }> {
  const chat = root.querySelector("#chat");
  if (!chat) return couldNot("the chat is not on the page");
  const listeners = new Set<() => void>();
  const pendingSince: number[] = [];
  const samples: number[] = [];
  let scheduled = false;

  const sync = (messageIds: number[]) => {
    const wanted = new Set(messageIds);
    for (const host of Array.from(chat.querySelectorAll<HTMLElement>(`.${INLINE_HOST_CLASS}`))) {
      const messageId = Number(host.dataset.mesid);
      if (!wanted.has(messageId) || mesIdOf(host) !== String(messageId)) host.remove();
    }
    const hosts = new Map<number, HTMLElement>();
    for (const messageId of wanted) {
      const block = chat.querySelector(`.mes[mesid="${messageId}"] .mes_block`);
      if (!block) continue;
      let host = block.querySelector<HTMLElement>(`:scope > .${INLINE_HOST_CLASS}`);
      if (!host) {
        host = document.createElement("div");
        host.id = hostIdFor(messageId);
        host.className = INLINE_HOST_CLASS;
        host.dataset.mesid = String(messageId);
        block.appendChild(host);
      }
      hosts.set(messageId, host);
    }
    const now = performance.now();
    while (pendingSince.length) samples.push(now - (pendingSince.shift() ?? now));
    samples.splice(0, Math.max(0, samples.length - ATTACH_SAMPLES));
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

  return wrote({
    hosts: {
      sync,
      onRebuild: (listener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
      attachTimes: () => [...samples],
      dispose: () => {
        unsubscribe();
        listeners.clear();
        chat.querySelectorAll(`.${INLINE_HOST_CLASS}`).forEach((host) => host.remove());
      },
    },
  });
}
