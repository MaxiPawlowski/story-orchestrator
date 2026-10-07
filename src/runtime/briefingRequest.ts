import type { BriefingView } from "@engine/index";

export type BriefingRequest = { kind: "story" } | { kind: "identity" } | { kind: "preview"; view: BriefingView | null; chapter?: BriefingView | null };

type Listener = (request: BriefingRequest) => void;

const listeners = new Set<Listener>();

export const onBriefingRequest = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const requestBriefing = (request: BriefingRequest = { kind: "story" }): boolean => {
  listeners.forEach((listener) => listener(request));
  return listeners.size > 0;
};
