import type { ImageSettings } from "./settings";

export interface ImageServiceProbe {
  st(): Promise<{ ready: boolean }>;
  media(): Promise<unknown>;
}

export const imageServiceReady = async (backend: ImageSettings["backend"], probe: ImageServiceProbe): Promise<boolean> =>
  backend === "st" ? (await probe.st()).ready : (await probe.media()) !== null;
