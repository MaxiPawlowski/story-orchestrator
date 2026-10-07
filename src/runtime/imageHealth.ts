export type ImageServiceState = "ready" | "absent" | "unknown";
export type ImageBrokerAdapter = "none" | "unsloth" | "managed";

export interface ImageHealthView {
  enabled: boolean;
  backend: "st" | "comfy";
  automation: "manual" | "story" | "everyN" | "tool";
  service: ImageServiceState;
  detail: string;
  source: string | null;
  missingModels: string[];
  broker: ImageBrokerAdapter | null;
}

let current: ImageHealthView | null = null;

export const setImageHealth = (next: ImageHealthView | null): void => { current = next; };
export const imageHealth = (): ImageHealthView | null => current;
