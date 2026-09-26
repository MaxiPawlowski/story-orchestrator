import { getContext } from "./context";
import { subscribeToEventSource, subscribeToEvents, type EventHandler } from "@utils/event-source";
import type { HostEntriesLoaded, HostScannableEntry } from "./hostTypes";

export type { EventHandler } from "@utils/event-source";

export interface HostEventPayloads {
  CHAT_CHANGED: [];
  CHAT_RENAMED: [payload: { avatarId?: string; groupId?: string | null; oldFileName: string; newFileName: string }];
  CHAT_CREATED: [];
  GROUP_CHAT_CREATED: [];
  CHAT_DELETED: [name: string];
  GROUP_CHAT_DELETED: [chatId: string];
  MESSAGE_SENT: [payload: Record<string, unknown> | undefined];
  MESSAGE_RECEIVED: [messageId: number, messageType?: string];
  MESSAGE_SWIPED: [messageId: number];
  MESSAGE_EDITED: [messageId: number];
  MESSAGE_DELETED: [chatLength: number];
  MESSAGE_SWIPE_DELETED: [payload: { messageId: number; swipeId: number; newSwipeId: number }];
  MESSAGE_UPDATED: [messageId: number];
  GROUP_MEMBER_DRAFTED: [characterId: number | [number]];
  GROUP_WRAPPER_STARTED: [payload: Record<string, unknown> | undefined];
  GROUP_WRAPPER_FINISHED: [payload: Record<string, unknown> | undefined];
  GENERATION_STARTED: [
    typeOrPayload: string | Record<string, unknown> | undefined,
    params?: Record<string, unknown>,
    dryRun?: boolean,
    payload?: Record<string, unknown> | [Record<string, unknown>],
  ];
  GENERATION_STOPPED: [];
  GENERATION_ENDED: [];
  STREAM_TOKEN_RECEIVED: [text: string];
  WORLDINFO_UPDATED: [name: string, data: unknown];
  WORLDINFO_SETTINGS_UPDATED: [];
  // The per-call arrays, emitted inside getSortedEntries before its sort/hash/clone.
  WORLDINFO_ENTRIES_LOADED: [payload: HostEntriesLoaded];
  // Every entry a non-dry scan activated; not emitted when nothing fired.
  WORLD_INFO_ACTIVATED: [entries: HostScannableEntry[]];
  GROUP_UPDATED: [];
  SETTINGS_UPDATED: [];
  PERSONA_CHANGED: [avatar: string];
  CHARACTER_MESSAGE_RENDERED: [messageId: number, messageType?: string];
  PRESET_CHANGED: [payload: { apiId: string; name: string }];
  // Script.js:5318 (main Generate only, dry runs too) and openai.js:3146 (every CC request, awaited before fetch).
  GENERATE_AFTER_DATA: [generateData: Record<string, unknown>, dryRun?: boolean];
  CHAT_COMPLETION_SETTINGS_READY: [generateData: Record<string, unknown>];
  // Script.js:7151-7157, fires on change only and for the main API only.
  ONLINE_STATUS_CHANGED: [status: string];
  // Connection-manager/index.js:347,780,796,879,996,1015 (keys events.js:82-84).
  CONNECTION_PROFILE_UPDATED: [previous: { id?: string } | undefined, next: { id?: string } | undefined];
  CONNECTION_PROFILE_DELETED: [profile: { id?: string } | undefined];
  CONNECTION_PROFILE_CREATED: [profile: { id?: string } | undefined];
}

export type HostEventName = keyof HostEventPayloads;

export type TypedHostEventHandler<K extends HostEventName> =
  (...args: HostEventPayloads[K]) => void;

export interface HostSubscriptionEntry {
  eventName: string | undefined;
  handler: EventHandler;
}

const resolveEventName = (eventName: string | undefined): string | undefined => {
  if (!eventName) return eventName;
  const eventTypes = (getContext().eventTypes ?? {}) as Record<string, string | undefined>;
  return eventTypes[eventName] ?? eventName;
};

export function subscribeToHostEvent<K extends HostEventName>(
  eventName: K | string | undefined,
  handler: TypedHostEventHandler<K>,
): () => void {
  const resolved = resolveEventName(eventName);
  if (!resolved) return () => {};
  const { eventSource } = getContext();
  return subscribeToEventSource({
    source: eventSource,
    eventName: resolved,
    handler: handler as EventHandler,
  });
}

export function subscribeToHostEvents(
  entries: HostSubscriptionEntry[],
): () => void {
  const { eventSource } = getContext();
  return subscribeToEvents(eventSource, entries.map((entry) => ({ ...entry, eventName: resolveEventName(entry.eventName) })));
}
