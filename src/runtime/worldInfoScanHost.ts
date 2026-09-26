import type { NormalizedStoryV2 } from "@engine/index";
import { installScanGating, probeScanGating, readLorebookEntries, setLorebookEntriesDisabled, showConfirmPopup, type ScanGatingHandle } from "@services/STAPI";
import { replayWorldInfoFiles } from "./effectsApplier";
import { onSettingsWrite } from "./librarySave";
import { evaluateRequirements } from "./requirements";
import { beginRun, type RunOwnership } from "./runToken";
import type { NormalizedLedger, ScanGateRow, ScanGateStats } from "./scanGatePlan";
import { getGlobalSettings, setGlobalSettings } from "./settingsStore";
import { listStoryRecords } from "./storyLibrary";
import { createWiGating, type CapabilityReading, type NormalizePreviewBook, type WiGating } from "./worldInfoGating";
import { noteScanGate, scanGatingActive, setScanGatingActive, setWiGatingStatus } from "./worldInfoMode";
import type { NormalizeOutcome } from "./worldInfoNormalize";
import { ScanGateProvider, type ScanGateChoice } from "./worldInfoScan";

export interface ScanGatingWiring {
  chatId: () => string | null;
  ownedChat: () => string | null;
  story: () => NormalizedStoryV2 | null;
  path: () => string[];
  ownership: RunOwnership;
  journal: (summary: string, note: string) => void;
  notify: () => void;
}

export interface ScanGatingDebug {
  active: () => boolean;
  capability: () => CapabilityReading | null;
  gate: () => ScanGateChoice;
  lastScan: () => (ScanGateStats & { owner: "story" | "no-story" }) | null;
  timings: () => number[];
  normalize: () => Promise<NormalizeOutcome | null>;
  requestScan: () => Promise<boolean>;
  requestFile: () => Promise<void>;
  sync: () => Promise<void>;
}

export const SCAN_TIMING_LIMIT = 500;

let running: WiGating | null = null;

/** v2.5 plan 01: the settings row, the Repair action and the removal dialog reach the gating through this. */
export const wiGating = (): WiGating | null => running;

const library = () => listStoryRecords().map((record) => record.raw);

/** v2.5 plan 01 E: what the removal dialog may offer for a library story, and the restore it runs if chosen. */
export function removalRestore(storyId: string): { entries: number; run: () => Promise<{ restored: number; refused: string[] }> } | null {
  const gating = running;
  const record = listStoryRecords().find((entry) => entry.id === storyId);
  if (!gating || !record || getGlobalSettings().worldInfo.gatingMode !== "scan") return null;
  const entries = gating.restorable(record.raw).reduce((sum, book) => sum + book.comments.length, 0);
  if (!entries) return null;
  return { entries, run: async () => {
    const outcome = await gating.restore(record.raw);
    return { restored: outcome.restored.length, refused: outcome.refused };
  } };
}

const confirmNormalisation = (preview: NormalizePreviewBook[]) => {
  const total = preview.reduce((sum, book) => sum + book.entries, 0);
  const lines = preview.map((book) => `${book.lorebook}: ${book.entries} ${book.entries === 1 ? "entry" : "entries"}`);
  return showConfirmPopup([
    `Switch lorebook gating to per chat? ${total} story lorebook ${total === 1 ? "entry" : "entries"} will be switched off in ${preview.length === 1 ? "its lorebook" : "their lorebooks"}:`,
    ...lines,
    "These entries will rest off. Story Orchestrator switches them on per chat; with the extension off they stay off.",
  ].join("\n"), { okButton: "Switch to per chat", cancelButton: "Keep file writes" });
};

// v2.5 plan 01. The scan handler gates only while the gating is active (normalised first, W2); before that, and
// in file mode, it does nothing and the file path runs.
export function startScanGating(deps: ScanGatingWiring): { reassert: () => void; dispose: () => void } {
  setScanGatingActive(false);
  let ledger: NormalizedLedger = getGlobalSettings().worldInfo.normalized;
  let handle: ScanGatingHandle | null = null;
  let lastScan: (ScanGateStats & { owner: "story" | "no-story" }) | null = null;
  const timings: number[] = [];
  const provider = new ScanGateProvider({
    chatId: deps.chatId,
    ownedChat: deps.ownedChat,
    story: deps.story,
    path: deps.path,
    ready: () => evaluateRequirements(deps.story()).ready,
    library,
    libraryRevision: () => listStoryRecords().map((record) => `${record.id}@${record.version}:${record.hash}`).join(","),
    ledger: () => ledger,
  });
  const apply = (arrays: Parameters<Parameters<typeof installScanGating>[0]>[0]) => {
    if (!scanGatingActive()) return;
    const started = performance.now();
    const rows: ScanGateRow[] = [];
    lastScan = provider.apply(arrays, rows);
    timings.push(performance.now() - started);
    if (timings.length > SCAN_TIMING_LIMIT) timings.shift();
    noteScanGate({ chatId: deps.chatId(), owner: lastScan.owner, rows });
    gating.noteScan(lastScan.owner, rows);
  };
  const gating = createWiGating({
    settings: () => getGlobalSettings().worldInfo,
    write: (patch) => {
      ledger = setGlobalSettings({ worldInfo: patch }).worldInfo.normalized;
    },
    library,
    read: readLorebookEntries,
    disable: (lorebook, comments) => setLorebookEntriesDisabled(lorebook, comments, true),
    enable: (lorebook, comments) => setLorebookEntriesDisabled(lorebook, comments, false),
    handler: {
      install: () => { handle = installScanGating(apply); },
      probe: () => (handle ? probeScanGating(handle) : Promise.resolve({ state: "error" as const, detail: "the scan handler is not installed" })),
      dispose: () => {
        handle?.dispose();
        handle = null;
      },
    },
    setActive: setScanGatingActive,
    replayFilePath: async () => {
      const story = deps.story();
      const owned = story && deps.chatId() !== null && deps.chatId() === deps.ownedChat() ? story : null;
      const refused = await replayWorldInfoFiles(library(), owned, owned && evaluateRequirements(owned).ready ? deps.path() : null, beginRun(deps.ownership));
      if (refused.length) deps.journal("world_info could not be applied", refused.join("; "));
    },
    confirm: confirmNormalisation,
    toast: (text) => { window.toastr?.info?.(text, "Story Orchestrator"); },
    journal: deps.journal,
    publish: (status) => {
      ledger = getGlobalSettings().worldInfo.normalized;
      setWiGatingStatus(status);
      deps.notify();
    },
  });
  running = gating;
  const stopWatching = onSettingsWrite(() => { void gating.sync(); });
  void gating.sync();
  const debug: ScanGatingDebug = {
    active: gating.active,
    capability: () => gating.status().capability,
    gate: () => provider.choose(),
    lastScan: () => lastScan,
    timings: () => [...timings],
    normalize: gating.renormalize,
    requestScan: gating.requestScan,
    requestFile: gating.requestFile,
    sync: gating.sync,
  };
  globalThis.storyOrchestratorScanGating = debug;
  return {
    reassert: () => handle?.reassert(),
    dispose: () => {
      stopWatching();
      gating.dispose();
      if (running === gating) running = null;
      setWiGatingStatus(null);
      globalThis.storyOrchestratorScanGating = undefined;
    },
  };
}
