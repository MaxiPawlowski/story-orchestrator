import type { EngineHistory, EngineState } from "@engine/index";
import { getContext } from "@services/STAPI";

import { stripGlobalSettings } from "./extras";
import { FingerprintKeeper } from "./fingerprints";
import type { DecodeJournal } from "./messageIdentity";
import { evictedStoryNotice, savePersistedRuntime, type ChatWrite, type ChatWriteKind } from "./persistence";
import type { RunOwner } from "./runOwner";
import { beginRun, type RunGuard } from "./runToken";
import { ServedRequests, type SaveEvidenceResult, type SaveObservation } from "./saveEvidence";
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
  /** A message that changed with no event goes through the ordinary rollback. */
  rollback: (messageId: number, journal: DecodeJournal) => Promise<unknown>;
}

const CHAT_WRITE_LABEL: Record<ChatWriteKind, string> = {
  select: "story selection",
  drop: "dropped story state",
  replace: "replaced unreadable story state",
  restamp: "chat rename restamp",
};

const isChatWriteKind = (tag: string | null): tag is ChatWriteKind => tag !== null && Object.hasOwn(CHAT_WRITE_LABEL, tag);

const labelled = (observation: SaveObservation, own: ChatWriteKind | null, note: string): string => {
  const asker = observation.askedBy === undefined ? own : observation.askedBy;
  return isChatWriteKind(asker) ? `${CHAT_WRITE_LABEL[asker]}: ${note}` : note;
};

const chatNow = (): unknown[] => (Array.isArray(getContext().chat) ? getContext().chat : []);

const driftNote = (messageId: number, chatLength: number, last: number): string => (messageId === chatLength && chatLength < last + 1
  ? `the chat ends at message ${chatLength - 1} while the story had read up to message ${last} (a branch, or messages removed while the story was not listening); stepped back from ${messageId}`
  : `message ${messageId} no longer says what it said when the story read it, and no event announced the change (another extension rewrote it, or a move named only one of the ` +
    `rows it swapped); stepped back from ${messageId}`);

// The one place a run's state is written into the open chat, split out of RuntimeManager. Every
// coordinator save() ends in `persist`; `landed` answers whether the last one actually reached disk.
export class ChatSave {
  readonly fingerprints = new FingerprintKeeper();
  private readonly served = new ServedRequests();
  private readonly claim = (observation: SaveObservation) => this.served.claim(observation.burst);

  constructor(private readonly deps: ChatSaveDeps) {}

  async persist() {
    const loaded = this.deps.loaded();
    if (!loaded) return;
    // The chokepoint: every coordinator save() ends here, and `saveMetadata` writes into
    // whichever chat ST has open at this instant, so a runtime hydrated for another chat declines
    // rather than guessing. is the recorded case: a new group chat inherited the run.
    if (!this.deps.owner.ownsOpenChat()) {
      this.deps.journal("save skipped: this run belongs to another chat", `claimed ${this.deps.owner.claimedChat()}, open chat is ${String(getContext().chatId ?? "")}`, true);
      return;
    }
    const extras = this.deps.extras();
    extras.lastSessionAt = new Date().toISOString();
    const engine = this.deps.engine();
    // Losing a story's state is a fact about this chat, not a later surprise.
    // The fingerprints land in the same write as the boundary they describe.
    const fingerprints = this.fingerprints.capture(chatNow(), engine.history.from.messageId, engine.state.lastMessageId);
    const record = {
      storyId: loaded.record.id,
      storyTitle: loaded.story.title,
      pinnedStory: loaded.record.raw,
      playedVersion: loaded.record.version,
      contentHashAtLoad: loaded.record.hash,
      engineState: engine.state,
      engineHistory: engine.history,
      extras: stripGlobalSettings(extras),
      ...(fingerprints ? { fingerprints } : {})
    };
    const evicted = savePersistedRuntime(record);
    const notice = evictedStoryNotice(evicted, (id) => listStoryRecords().find((record) => record.id === id)?.title ?? null);
    if (notice) this.deps.recap(notice.summary, notice.detail);
    await this.saveAndObserve();
  }

  // `saveMetadata` swallows its own errors, so the write is OBSERVED (saveEvidence).
  private async saveAndObserve() {
    const deps = saveEvidenceDeps(() => this.deps.extras().saveHealth, (health) => { this.deps.extras().saveHealth = health; }, () => undefined);
    const journal = (summary: string, note: string, observation: SaveObservation) => this.deps.journal(summary, labelled(observation, null, note), false);
    // Armed first, write second: the watcher has to be listening before the request goes out.
    const observed = recordSaveEvidence({ ...deps, journal, claim: this.claim }, this.deps.engine().state.boundary);
    await Promise.all([Promise.resolve(getContext().saveMetadata?.()), observed]);
  }

  /** A chat write made outside persist (select, drop, replace, restamp) reads the observation
   *  `saveOpenChat` armed. The health goes to the extras the write was made for; the journal only while
   *  the world it was made in is still the current one. */
  recordWrite(write: ChatWrite): Promise<SaveEvidenceResult> | null {
    if (!this.deps.loaded() || !this.deps.owner.ownsOpenChat() || write.chatId !== this.deps.owner.claimedChat()) return null;
    const run = beginRun(this.deps.owner.ownership);
    const extras = this.deps.extras();
    const deps = saveEvidenceDeps(() => extras.saveHealth, (health) => { extras.saveHealth = health; }, () => undefined);
    const journal = (summary: string, note: string, observation: SaveObservation) => { if (run.stillOwns()) this.deps.journal(summary, labelled(observation, write.kind, note), false); };
    return recordSaveEvidence({ ...deps, observe: () => write.observed, journal, claim: this.claim }, this.deps.engine().state.boundary);
  }

  /** "Did the write reach the chat's stored state": `persist` cannot answer it, because
   *  `saveMetadata` catches its own errors and it returns early rather than throwing — and a save that
   *  never went out (no story, another chat's runtime) is not a landed one either (memoryQueue). */
  /** At a boundary, a hydrate or a same-chat reload, a consumed message that no longer
   *  says what it said is stepped back from. Answers whether the caller's run may go on writing. */
  async reconcile(run: RunGuard): Promise<boolean> {
    if (!this.deps.loaded() || !this.deps.owner.ownsOpenChat() || !run.stillOwns()) return run.stillOwns();
    const chat = chatNow();
    const last = this.deps.engine().state.lastMessageId;
    const drift = this.fingerprints.drift(chat, last);
    if (drift === null) return true;
    await this.deps.rollback(drift, { summary: `eventless change at message ${drift}`, note: driftNote(drift, chat.length, last) });
    return run.stillOwns();
  }

  /** An edit that left a consumed message exactly as the story read it changes nothing. */
  unchanged(messageId: number): boolean {
    return Boolean(this.deps.loaded()) && this.deps.owner.ownsOpenChat() && this.fingerprints.unchanged(chatNow(), messageId);
  }

  /** The first consumed message that changed, for a mutation event that names a later one. */
  firstDrift(): number | null {
    return this.deps.loaded() && this.deps.owner.ownsOpenChat() ? this.fingerprints.drift(chatNow(), this.deps.engine().state.lastMessageId) : null;
  }

  note(summary: string, detail: string) { this.deps.journal(summary, detail, true); }

  landed(): boolean { return Boolean(this.deps.loaded()) && this.deps.owner.ownsOpenChat() && !saveWasLost(this.deps.extras().saveHealth); }
}
