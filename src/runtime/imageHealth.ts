export type ImageServiceState = "ready" | "absent" | "unknown";
export type ImageBrokerAdapter = "none" | "observe" | "supervise" | "managed";

export interface ImageHealthView {
  enabled: boolean;
  backend: "st" | "comfy";
  automation: "manual" | "story" | "everyN" | "tool";
  service: ImageServiceState;
  detail: string;
  source: string | null;
  missingModels: string[];
  broker: ImageBrokerAdapter | null;
  storyWorkflows?: { wanted: string[]; missing: string[]; missingNodes: string[]; comfySource: boolean };
}

let current: ImageHealthView | null = null;

export const setImageHealth = (next: ImageHealthView | null): void => { current = next; };
export const imageHealth = (): ImageHealthView | null => current;
