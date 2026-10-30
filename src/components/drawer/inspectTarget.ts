import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let target: number | null = null;

export const setInspectTarget = (messageId: number | null) => {
  target = messageId;
  listeners.forEach((listener) => listener());
};

export const readInspectTarget = () => target;

export const useInspectTarget = () => useSyncExternalStore(
  (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  readInspectTarget,
);
