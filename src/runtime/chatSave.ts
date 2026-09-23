import type { EngineHistory, EngineState } from "@engine/index";
import { getContext } from "@services/STAPI";

import { stripGlobalSettings } from "./extras";
import { evictedStoryNotice, savePersistedRuntime } from "./persistence";
import type { RunOwner } from "./runOwner";
import { recordSaveEvidence, saveEvidenceDeps } from "./saveEvidenceHost";
import { saveWasLost } from "./saveHealth";
import { listStoryRecords } from "./storyLibrary";
import type { LoadedStory, RuntimeExtras } from "./types";

export interface ChatSaveDeps {
  loaded: () => LoadedStory | null;
  engine: () => { state: EngineState; history: EngineHistory };
  extras: () => RuntimeExtras;
  owner: RunOwner;
  /** A journal record, and whether it must also reach the persisted ring now. */
  journal: (summary: string, note: string, persistNow: boolean) => void;
  recap: (summary: string, detail: string) => void;
}

// V26: the one place a run's state is written into the open chat, split out of RuntimeManager. Every
// coordinator save() ends in `persist`; `landed` answers whether the last one actually reached disk.
export class ChatSave {
  constructor(private readonly deps: ChatSaveDeps) {}

  async persist() {
    const loaded = this.deps.loaded();
    if (!loaded) return;
    // v2.3 plan 03. The chokepoint: every coordinator save() ends here, and `saveMetadata` writes into
    // whichever chat ST has open at this instant, so a runtime hydrated for another chat declines
    // rather than guessing. v2.1 plan 08 is the recorded case: a new group chat inherited the run.
    if (!this.deps.owner.ownsOpenChat()) {
      this.deps.journal("save skipped: this run belongs to another chat", `claimed ${this.deps.owner.claimedChat()}, open chat is ${String(getContext().chatId ?? "")}`, true);
      return;
    }
    const extras = this.deps.extras();
    extras.lastSessionAt = new Date().toISOString();
    const engine = this.deps.engine();
    // v2.3 plan 05. Losing a story's state is a fact about this chat, not a later surprise.
    const evicted = savePersistedRuntime({ storyId: loaded.record.id, storyTitle: loaded.story.title, pinnedStory: loaded.record.raw, playedVersion: loaded.record.version, contentHashAtLoad: loaded.record.hash, engineState: engine.state, engineHistory: engine.history, extras: stripGlobalSettings(extras) });
    const notice = evictedStoryNotice(evicted, (id) => listStoryRecords().find((record) => record.id === id)?.title ?? null);
    if (notice) this.deps.recap(notice.summary, notice.detail);
    await this.saveAndObserve();
  }

  // v2.3 plan 06: `saveMetadata` swallows its own errors, so the write is OBSERVED (saveEvidence).
  private async saveAndObserve() {
    const deps = saveEvidenceDeps(() => this.deps.extras().saveHealth, (health) => { this.deps.extras().saveHealth = health; }, (summary, note) => this.deps.journal(summary, note, false));
    // Armed first, write second: the watcher has to be listening before the request goes out.
    const observed = recordSaveEvidence(deps, this.deps.engine().state.boundary);
    await Promise.all([Promise.resolve(getContext().saveMetadata?.()), observed]);
  }

  /** v2.3 plan 05. "Did the write reach the chat's stored state": `persist` cannot answer it, because
   *  `saveMetadata` catches its own errors and it returns early rather than throwing — and a save that
   *  never went out (no story, another chat's runtime) is not a landed one either (memoryQueue). */
  landed(): boolean { return Boolean(this.deps.loaded()) && this.deps.owner.ownsOpenChat() && !saveWasLost(this.deps.extras().saveHealth); }
}
