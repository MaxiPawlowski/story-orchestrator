import type { NormalizedStoryV2 } from "@engine/index";
import {
  installScanGating, loadLorebook, probeScanGating, readLorebookEntries, setLorebookEntriesDisabled, showConfirmPopup, subscribeToHostEvent, vectorsScanWorldInfo,
  type ScanGatingHandle,
} from "@services/STAPI";
import { replayWorldInfoFiles } from "./effectSteps";
import { onSettingsWrite } from "./librarySave";
import { applyLoreExclusive, loreExclusiveFor, type LoreExclusiveRefusal, type LoreExclusiveStats } from "./loreExclusive";
import type { CompleteLoreSelection } from "./loreSelect";
import { createMirrorScan } from "./mirrorScan";
import { evaluateRequirements, requirementsOptions } from "./requirements";
import { beginRun, type RunOwnership } from "./runToken";
import type { NormalizedLedger, ScanGateRow, ScanGateStats } from "./scanGatePlan";
import { getGlobalSettings, setGlobalSettings } from "./settingsStore";
import { listStoryRecords } from "./storyLibrary";
import { createWiGating, type CapabilityReading, type NormalizePreviewBook, type WiGating } from "./worldInfoGating";
import { gatedBy } from "./worldInfoLedger";
import { noteScanGate, scanGatingActive, setScanGatingActive, setScanGatingSettled, setWiGatingStatus } from "./worldInfoMode";
import type { MemoryMirrorBook } from "./types";
import type { NormalizeOutcome } from "./worldInfoNormalize";
import { ScanGateProvider, type ScanGateChoice } from "./worldInfoScan";
import { ScanGuard, type ScanGuardResult } from "./worldInfoScanGuard";

export interface ScanGatingWiring {
  chatId: () => string | null;
  ownedChat: () => string | null;
  story: () => NormalizedStoryV2 | null;
  path: () => string[];
  filePath: () => string[];
  mirrorBook: () => MemoryMirrorBook | null;
  exclusive: {
    useActive: () => boolean;
    messageId: () => number;
    loud: () => boolean;
    selection: () => CompleteLoreSelection | null;
  };
  ownership: RunOwnership;
  journal: (summary: string, note: string) => void;
  notify: () => void;
}

export interface ScanGatingDebug {
  active: () => boolean;
  capability: () => CapabilityReading | null;
  gate: () => ScanGateChoice;
  lastScan: () => (ScanGateStats & { owner: "story" | "no-story" }) | null;
  lastGuard: () => ScanGuardResult | null;
  lastMirror: () => number;
  lastExclusive: () => { refusal: LoreExclusiveRefusal | null; stats: LoreExclusiveStats } | null;
  timings: () => number[];
  normalize: () => Promise<NormalizeOutcome | null>;
  requestScan: () => Promise<boolean>;
  requestFile: () => Promise<void>;
  sync: () => Promise<void>;
}

export const SCAN_TIMING_LIMIT = 500;

let running: WiGating | null = null;

/** The settings row, the Repair action and the removal dialog reach the gating through this. */
export const wiGating = (): WiGating | null => running;

const library = () => listStoryRecords().map((record) => record.raw);
const libraryRevision = () => listStoryRecords().map((record) => `${record.id}:${record.hash}`).join(",");

const startScanGuard = (deps: ScanGatingWiring) => {
  const guard = new ScanGuard({
    openChat: deps.chatId,
    storyChat: deps.ownedChat,
    story: deps.story,
    path: deps.filePath,
    ready: () => evaluateRequirements(deps.story(), requirementsOptions(deps.mirrorBook(), false)).ready,
    library,
    libraryRevision,
  });
  let last: ScanGuardResult | null = null;
  const handle = installScanGating((arrays) => {
    if (!scanGatingActive()) last = guard.apply(arrays);
  });
  return { handle, last: () => last };
};

/** E: what the removal dialog may offer for a library story, and the restore it runs if chosen. */
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

// The scan handler gates only while the gating is active (normalised first, W2); before that, and
// in file mode, it does nothing and the file path runs.
export function startScanGating(deps: ScanGatingWiring): { reassert: () => void; dispose: () => void } {
  setScanGatingActive(false);
  setScanGatingSettled(false);
  const scanGuard = startScanGuard(deps);
  let ledger: NormalizedLedger = getGlobalSettings().worldInfo.normalized;
  let handle: ScanGatingHandle | null = null;
  let lastScan: (ScanGateStats & { owner: "story" | "no-story" }) | null = null;
  const timings: number[] = [];
  let owners: { revision: string; of: (lorebook: string, comment: string) => string[] } | null = null;
  const ownersOf = () => {
    const revision = listStoryRecords().map((record) => `${record.id}:${record.hash}`).join(",");
    if (owners?.revision !== revision) owners = { revision, of: gatedBy(listStoryRecords().map((record) => ({ title: record.title, raw: record.raw }))) };
    return owners.of;
  };
  const provider = new ScanGateProvider({
    chatId: deps.chatId,
    ownedChat: deps.ownedChat,
    story: deps.story,
    path: deps.path,
    ready: () => evaluateRequirements(deps.story(), requirementsOptions(null, true)).ready,
    library,
    libraryRevision,
    ledger: () => ledger,
  });
  const mirror = createMirrorScan({
    owner: () => ({ chatId: deps.chatId(), ownedChat: deps.ownedChat(), hasStory: deps.story() !== null, book: deps.mirrorBook() }),
    load: loadLorebook,
  });
  let lastMirror = 0;
  let lastExclusive: { refusal: LoreExclusiveRefusal | null; stats: LoreExclusiveStats } | null = null;
  let stopMirrorWatch: (() => void) | null = null;
  const apply = (arrays: Parameters<Parameters<typeof installScanGating>[0]>[0]) => {
    if (!scanGatingActive()) return;
    const started = performance.now();
    lastMirror = mirror.append(arrays);
    const rows: ScanGateRow[] = [];
    lastScan = provider.apply(arrays, rows);
    const plan = loreExclusiveFor({ ...deps.exclusive, scanActive: scanGatingActive, story: deps.story, chatId: deps.chatId, vectorsScanWorldInfo });
    lastExclusive = { refusal: plan.refusal, stats: applyLoreExclusive(arrays, plan) };
    timings.push(performance.now() - started);
    if (timings.length > SCAN_TIMING_LIMIT) timings.shift();
    const of = ownersOf();
    noteScanGate({ chatId: deps.chatId(), owner: lastScan.owner, rows: rows.map((row) => ({ ...row, gatedBy: of(row.lorebook, row.comment) })) });
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
      install: () => {
        handle = installScanGating(apply);
        stopMirrorWatch ??= subscribeToHostEvent("WORLDINFO_UPDATED", (name, data) => { mirror.updated(name, data); });
      },
      probe: () => (handle ? probeScanGating(handle) : Promise.resolve({ state: "error" as const, detail: "the scan handler is not installed" })),
      dispose: () => {
        handle?.dispose();
        handle = null;
        stopMirrorWatch?.();
        stopMirrorWatch = null;
      },
    },
    setActive: setScanGatingActive,
    settle: setScanGatingSettled,
    replayFilePath: async () => {
      const story = deps.story();
      const owned = story && deps.chatId() !== null && deps.chatId() === deps.ownedChat() ? story : null;
      const ready = owned !== null && evaluateRequirements(owned, requirementsOptions(deps.mirrorBook(), false)).ready;
      const refused = await replayWorldInfoFiles(library(), owned, ready ? deps.path() : null, beginRun(deps.ownership));
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
    lastGuard: scanGuard.last,
    lastMirror: () => lastMirror,
    lastExclusive: () => lastExclusive,
    timings: () => [...timings],
    normalize: gating.renormalize,
    requestScan: gating.requestScan,
    requestFile: gating.requestFile,
    sync: gating.sync,
  };
  globalThis.storyOrchestratorScanGating = debug;
  return {
    reassert: () => {
      scanGuard.handle.reassert();
      handle?.reassert();
    },
    dispose: () => {
      scanGuard.handle.dispose();
      stopWatching();
      stopMirrorWatch?.();
      stopMirrorWatch = null;
      gating.dispose();
      if (running === gating) running = null;
      setWiGatingStatus(null);
      globalThis.storyOrchestratorScanGating = undefined;
    },
  };
}
