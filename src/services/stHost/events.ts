import { getContext } from "./context";
import { subscribeToEventSource, subscribeToEvents, type EventHandler } from "@utils/event-source";

export type { EventHandler } from "@utils/event-source";

export interface HostEventPayloads {
  CHAT_CHANGED: [];
  CHAT_CREATED: [];
  GROUP_CHAT_CREATED: [];
  CHAT_DELETED: [];
  GROUP_CHAT_DELETED: [];
  MESSAGE_SENT: [payload: Record<string, unknown> | undefined];
  MESSAGE_RECEIVED: [messageId: number, messageType?: string];
  GROUP_MEMBER_DRAFTED: [characterId: number | [number]];
  GENERATION_STARTED: [
    typeOrPayload: string | Record<string, unknown> | undefined,
    params?: Record<string, unknown>,
    dryRun?: boolean,
    payload?: Record<string, unknown> | [Record<string, unknown>],
  ];
  GENERATION_STOPPED: [];
  GENERATION_ENDED: [];
  WORLDINFO_UPDATED: [];
  WORLDINFO_SETTINGS_UPDATED: [];
  WORLDINFO_ENTRIES_LOADED: [];
  GROUP_UPDATED: [];
  CHARACTER_MESSAGE_RENDERED: [messageId: number, messageType?: string];
  PRESET_CHANGED: [payload: { apiId: string; name: string }];
}

export type HostEventName = keyof HostEventPayloads;

export type TypedHostEventHandler<K extends HostEventName> =
  (...args: HostEventPayloads[K]) => void;

export interface HostSubscriptionEntry {
  eventName: string | undefined;
  handler: EventHandler;
}

export function subscribeToHostEvent<K extends HostEventName>(
  eventName: K | string | undefined,
  handler: TypedHostEventHandler<K>,
): () => void {
  if (!eventName) return () => {};
  const { eventSource } = getContext();
  return subscribeToEventSource({
    source: eventSource,
    eventName,
    handler: handler as EventHandler,
  });
}

export function subscribeToHostEvents(
  entries: HostSubscriptionEntry[],
): () => void {
  const { eventSource } = getContext();
  return subscribeToEvents(eventSource, entries);
}
