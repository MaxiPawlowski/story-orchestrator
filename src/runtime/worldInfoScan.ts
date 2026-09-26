import type { NormalizedStoryV2 } from "@engine/index";
import { applyScanGate, emptyScanGateStats, restsOffIn, scanGatePlan, type NormalizedLedger, type ScanEntry, type ScanGate, type ScanGateRow, type ScanGateStats } from "./scanGatePlan";

// Spike (host-free). Which gate a scan gets. The scan belongs to the loaded story
// only when the chat SillyTavern is scanning for is the chat that story was loaded into and its
// requirements hold; anything else (another chat, ST's CHAT_CHANGED pre-cache that runs before our
// hydrate, not-ready requirements, no story) is "no story": every library gated entry off.
export interface ScanGateSources {
  chatId: () => string | null;
  ownedChat: () => string | null;
  story: () => NormalizedStoryV2 | null;
  path: () => string[];
  ready: () => boolean;
  library: () => unknown[];
  libraryRevision: () => string;
  ledger: () => NormalizedLedger;
}

export interface ScanGateChoice {
  gate: ScanGate;
  owner: "story" | "no-story";
  key: string;
}

export class ScanGateProvider {
  private memo: { key: string; choice: ScanGateChoice } | null = null;
  private ledgerSeen: NormalizedLedger | null = null;
  private restsOff: (lorebook: string, comment: string) => boolean = () => false;

  constructor(private readonly sources: ScanGateSources) {}

  choose(): ScanGateChoice {
    const chatId = this.sources.chatId();
    const story = this.sources.story();
    const owns = Boolean(story) && chatId !== null && chatId === this.sources.ownedChat() && this.sources.ready();
    const path = owns ? this.sources.path() : [];
    const key = [owns ? "story" : "no-story", chatId ?? "", owns ? `${story?.id ?? ""}@${story?.version ?? ""}` : "", path.join(">"), this.sources.libraryRevision()].join("|");
    if (this.memo?.key === key) return this.memo.choice;
    const choice: ScanGateChoice = { gate: scanGatePlan(this.sources.library(), owns ? story : null, path), owner: owns ? "story" : "no-story", key };
    this.memo = { key, choice };
    return choice;
  }

  restsOffFor(): (lorebook: string, comment: string) => boolean {
    const ledger = this.sources.ledger();
    if (ledger !== this.ledgerSeen) {
      this.ledgerSeen = ledger;
      this.restsOff = restsOffIn(ledger);
    }
    return this.restsOff;
  }

  apply(arrays: ScanEntry[][], rows?: ScanGateRow[]): ScanGateStats & { owner: "story" | "no-story" } {
    const choice = this.choose();
    if (!choice.gate.size) return { ...emptyScanGateStats(), owner: choice.owner };
    return { ...applyScanGate(arrays, choice.gate, this.restsOffFor(), rows), owner: choice.owner };
  }
}
