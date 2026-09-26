import type { ScanGateRow } from "./scanGatePlan";
import type { GatedEntryRef } from "./worldInfoLedger";

// v2.4 plan 05 T13 spike. True only while `worldInfo.gatingMode` is "scan" AND the scan handler was
// seen running on a probe scan (the `wiScanGating` capability). Otherwise the file path (per-chat
// writes plus release) runs exactly as before, which is also the S6 fallback.
export interface ScanGateView {
  chatId: string | null;
  owner: "story" | "no-story";
  rows: Array<ScanGateRow & { gatedBy?: string[] }>;
}

let scanGating = false;
let scanSettled = false;
let gatingMode: () => "file" | "scan" = () => "file";
let lastScan: ScanGateView | null = null;

export const scanGatingActive = (): boolean => scanGating;

export const readGatingModeWith = (read: () => "file" | "scan"): (() => void) => {
  gatingMode = read;
  return () => {
    if (gatingMode === read) gatingMode = () => "file";
  };
};

export const setScanGatingSettled = (settled: boolean): void => {
  scanSettled = settled;
};

export const worldInfoFilesHeld = (): boolean => scanGating || (!scanSettled && gatingMode() === "scan");

export const setScanGatingActive = (active: boolean): void => {
  scanGating = active;
  if (!active) lastScan = null;
};

// S5: what the last gated scan loaded and used, per gated entry, for the author view.
export const noteScanGate = (view: ScanGateView): void => {
  lastScan = view;
};

export const scanGateView = (): ScanGateView | null => (scanGating ? lastScan : null);

// v2.5 plan 01: the install-wide gating state the settings row and the Repair row read.
export interface WiGatingStatus {
  mode: "file" | "scan";
  active: boolean;
  capability: { state: "present" | "absent" | "error"; detail: string } | null;
  ledger: { books: number; entries: number };
  drift: GatedEntryRef[];
  missingKey: GatedEntryRef[];
  missing: GatedEntryRef[];
  unreadable: string[];
  busy: boolean;
}

let gatingStatus: WiGatingStatus | null = null;

export const setWiGatingStatus = (status: WiGatingStatus | null): void => {
  gatingStatus = status;
};

export const wiGatingStatus = (): WiGatingStatus | null => gatingStatus;
