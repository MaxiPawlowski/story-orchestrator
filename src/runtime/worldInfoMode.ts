import type { ScanGateRow } from "./scanGatePlan";

// v2.4 plan 05 T13 spike. True only while `worldInfo.gatingMode` is "scan" AND the scan handler was
// seen running on a probe scan (the `wiScanGating` capability). Otherwise the file path (per-chat
// writes plus release) runs exactly as before, which is also the S6 fallback.
export interface ScanGateView {
  chatId: string | null;
  owner: "story" | "no-story";
  rows: ScanGateRow[];
}

let scanGating = false;
let lastScan: ScanGateView | null = null;

export const scanGatingActive = (): boolean => scanGating;

export const setScanGatingActive = (active: boolean): void => {
  scanGating = active;
  if (!active) lastScan = null;
};

// S5: what the last gated scan loaded and used, per gated entry, for the author view.
export const noteScanGate = (view: ScanGateView): void => {
  lastScan = view;
};

export const scanGateView = (): ScanGateView | null => (scanGating ? lastScan : null);
