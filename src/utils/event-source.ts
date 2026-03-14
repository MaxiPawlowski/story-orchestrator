export type EventHandler = (...args: unknown[]) => void;

export interface EventSourceLike {
  on?: (eventName: string, handler: EventHandler) => void | (() => void);
  off?: (eventName: string, handler: EventHandler) => void;
  removeListener?: (eventName: string, handler: EventHandler) => void;
}

export interface SubscribeToEventSourceOptions {
  source?: EventSourceLike | null;
  eventName: string;
  handler: EventHandler;
}


const wrapCleanup = (eventName: string, cleanup: () => void) => {
  return () => {
    try {
      cleanup();
    } catch (err) {
      console.warn("[Story - subscribeToEventSource] unsubscribe failed", eventName, err);
    }
  };
};

export function subscribeToEventSource({
  source,
  eventName,
  handler,
}: SubscribeToEventSourceOptions): () => void {
  const NOOP = () => void (0);
  if (!source) return NOOP;

  try {
    if (typeof source.on === "function") {
      const off = source.on(eventName, handler);
      if (typeof off === "function") {
        return wrapCleanup(eventName, () => off.call(source));
      }
    }

    if (typeof source.off === "function") {
      return wrapCleanup(eventName, () => source.off!(eventName, handler));
    }

    const removeListener = (source as { removeListener?: EventSourceLike["removeListener"] })?.removeListener;
    if (typeof removeListener === "function") {
      return wrapCleanup(eventName, () => removeListener.call(source, eventName, handler));
    }
  } catch (err) {
    console.warn("[Story - subscribeToEventSource] subscribe failed", eventName, err);
  }

  return NOOP;
}

export function subscribeToEvents(
  source: EventSourceLike | null | undefined,
  entries: Array<{ eventName: string | null | undefined; handler: EventHandler }>,
): () => void {
  const offs: Array<() => void> = [];
  for (const { eventName, handler } of entries) {
    if (!eventName) continue;
    offs.push(subscribeToEventSource({ source, eventName, handler }));
  }
  return () => { for (const off of offs) off(); };
}
