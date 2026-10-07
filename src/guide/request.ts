import { targetForDoc } from "./links";
import type { GuideTarget } from "./types";

type Listener = (target: GuideTarget | null) => void;

const listeners = new Set<Listener>();

export const onGuideRequest = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const requestGuide = (doc?: string): boolean => {
  const target = doc ? targetForDoc(doc) : null;
  listeners.forEach((listener) => listener(target));
  return listeners.size > 0;
};
