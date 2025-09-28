export type EventHandler = (...args: any[]) => void;

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

const NOOP = () => {};

const wrapCleanup = (eventName: string, cleanup: () => void) => {
  return () => {
    try {
      cleanup();
    } catch (err) {
      console.warn("[subscribeToEventSource] unsubscribe failed", eventName, err);
    }
  };
};

export function subscribeToEventSource({
  source,
  eventName,
  handler,
}: SubscribeToEventSourceOptions): () => void {
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
    console.warn("[subscribeToEventSource] subscribe failed", eventName, err);
  }

  return NOOP;
}
