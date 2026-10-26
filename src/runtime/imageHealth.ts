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
  localText?: boolean;
  promptProfileMissing?: boolean;
  storyWorkflows?: { wanted: string[]; missing: string[]; missingNodes: string[]; comfySource: boolean };
}

export const loopbackUrl = (url: string | null | undefined): boolean => {
  try {
    const host = new URL(url ?? "").hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "::1" || /^127\./.test(host);
  } catch {
    return false;
  }
};

let current: ImageHealthView | null = null;

export const setImageHealth = (next: ImageHealthView | null): void => { current = next; };
export const imageHealth = (): ImageHealthView | null => current;
