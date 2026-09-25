import type { NormalizedStoryV2 } from "@engine/index";
import { disableWIEntry, installScanGating, loadLorebook, probeScanGating } from "@services/STAPI";
import { onSettingsWrite } from "./librarySave";
import { evaluateRequirements } from "./requirements";
import type { RunOwnership } from "./runToken";
import type { NormalizedLedger, ScanGateRow, ScanGateStats } from "./scanGatePlan";
import { getGlobalSettings, setGlobalSettings } from "./settingsStore";
import { listStoryRecords } from "./storyLibrary";
import { noteScanGate, setScanGatingActive } from "./worldInfoMode";
import { normalizeGatedEntries, spikeBook, type NormalizeOutcome } from "./worldInfoNormalize";
import { ScanGateProvider, type ScanGateChoice } from "./worldInfoScan";

export interface ScanGatingWiring {
  chatId: () => string | null;
  ownedChat: () => string | null;
  story: () => NormalizedStoryV2 | null;
  path: () => string[];
  ownership: RunOwnership;
  journal: (summary: string, note: string) => void;
}

export interface ScanGatingDebug {
  active: () => boolean;
  capability: () => { state: "present" | "absent" | "error"; detail: string } | null;
  gate: () => ScanGateChoice;
  lastScan: () => (ScanGateStats & { owner: "story" | "no-story" }) | null;
  timings: () => number[];
  normalize: () => Promise<NormalizeOutcome | null>;
}

export const SCAN_TIMING_LIMIT = 500;

// v2.4 plan 05 T13 spike wiring. Off unless the install-wide flag says "scan" at startup, and the
// file path stays in charge unless the handler is then seen running on a probe scan (S6).
export function startScanGating(deps: ScanGatingWiring): { reassert: () => void; dispose: () => void } {
  setScanGatingActive(false);
  if (getGlobalSettings().worldInfo.gatingMode !== "scan") return { reassert: () => undefined, dispose: () => undefined };
  let ledger: NormalizedLedger = getGlobalSettings().worldInfo.normalized;
  let capability: { state: "present" | "absent" | "error"; detail: string } | null = null;
  let lastScan: (ScanGateStats & { owner: "story" | "no-story" }) | null = null;
  const timings: number[] = [];
  const provider = new ScanGateProvider({
    chatId: deps.chatId,
    ownedChat: deps.ownedChat,
    story: deps.story,
    path: deps.path,
    ready: () => evaluateRequirements(deps.story()).ready,
    library: () => listStoryRecords().map((record) => record.raw),
    libraryRevision: () => listStoryRecords().map((record) => `${record.id}@${record.version}:${record.hash}`).join(","),
    ledger: () => ledger,
  });
  const handle = installScanGating((arrays) => {
    const started = performance.now();
    const rows: ScanGateRow[] = [];
    lastScan = provider.apply(arrays, rows);
    timings.push(performance.now() - started);
    if (timings.length > SCAN_TIMING_LIMIT) timings.shift();
    noteScanGate({ chatId: deps.chatId(), owner: lastScan.owner, rows });
  });
  let running: Promise<NormalizeOutcome | null> | null = null;
  const normalize = (): Promise<NormalizeOutcome | null> => {
    running ??= normalizeGatedEntries(listStoryRecords().map((record) => record.raw), ledger, {
      onlyBooks: spikeBook,
      present: async (lorebook) => {
        const data = await loadLorebook(lorebook);
        return data ? new Set(Object.values(data.entries).map((entry) => (typeof entry.comment === "string" ? entry.comment.trim() : ""))) : null;
      },
      disable: disableWIEntry,
      ownership: deps.ownership,
    }).then((outcome) => {
      if (outcome.refused.length) deps.journal("world info normalisation refused", outcome.refused.join("; "));
      if (outcome.changed) {
        ledger = outcome.ledger;
        setGlobalSettings({ worldInfo: { normalized: outcome.ledger } });
      }
      return outcome;
    }).catch((error) => {
      console.warn("[Story Orchestrator] world info normalisation failed", error);
      return null;
    }).finally(() => {
      running = null;
    });
    return running;
  };
  const stopWatching = onSettingsWrite(() => { void normalize(); });
  void probeScanGating(handle).then((report) => {
    capability = report;
    setScanGatingActive(report.state === "present");
    if (report.state === "present") void normalize();
  });
  const debug: ScanGatingDebug = { active: () => capability?.state === "present", capability: () => capability, gate: () => provider.choose(), lastScan: () => lastScan, timings: () => [...timings], normalize };
  globalThis.storyOrchestratorScanGating = debug;
  return {
    reassert: () => handle.reassert(),
    dispose: () => {
      stopWatching();
      handle.dispose();
      setScanGatingActive(false);
      globalThis.storyOrchestratorScanGating = undefined;
    },
  };
}
