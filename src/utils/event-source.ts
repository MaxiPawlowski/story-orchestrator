export type EventHandler = (...args: unknown[]) => void;

export type EventSourceLike = Pick<SillyTavernEventSource, "on"> & {
  off?: SillyTavernEventSource["off"];
  removeListener?: SillyTavernEventSource["removeListener"];
};

export interface SubscribeToEventSourceOptions {
  source?: EventSourceLike | null;
  eventName: string;
  handler: EventHandler;
}

const NOOP = () => void (0);

const wrapCleanup = (eventName: string, cleanup: () => void) => {
  return () => {
    try {
      cleanup();
    } catch (err) {
      console.warn("[Story - subscribeToEventSource] unsubscribe failed", eventName, err);
    }
  };
};

const resolveUnsubscribe = (
  source: EventSourceLike,
  eventName: string,
  handler: EventHandler,
  onResult: void | (() => void),
): () => void => {
  if (typeof onResult === "function") {
    return wrapCleanup(eventName, () => onResult.call(source));
  }
  if (typeof source.off === "function") {
    return wrapCleanup(eventName, () => source.off!(eventName, handler));
  }
  if (typeof source.removeListener === "function") {
    return wrapCleanup(eventName, () => source.removeListener!(eventName, handler));
  }
  return NOOP;
};

export function subscribeToEventSource({
  source,
  eventName,
  handler,
}: SubscribeToEventSourceOptions): () => void {
  if (!source) return NOOP;

  try {
    const onResult = source.on(eventName, handler);
    return resolveUnsubscribe(source, eventName, handler, onResult);
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
