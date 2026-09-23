import { mintToken, tokenMatches, type MessageWindow, type RunContext, type RunOwnership, type RunToken } from "./runToken";

export interface RunOwnerDeps {
  /** The chat SillyTavern has open right now — not necessarily the one this run belongs to. */
  openChatId: () => string;
  storyId: () => string | null;
  playedVersion: () => number | null;
}

/**
 * v2.3 plan 03: which world the runtime is in, and whether a result from an earlier one may still
 * be written.
 *
 * Kept out of `RuntimeManager` because it is a whole concern with its own rules, and because the
 * manager has a size budget that `architecture.test.ts` enforces. The manager owns one of these
 * and asks it questions; it never tracks epochs itself.
 */
export class RunOwner {
  private epoch = 0;
  private windowRevision = 0;
  private lowestMutatedMessageId: number | null = null;
  // The chat this run belongs to, claimed when the epoch is minted. Null until something claims
  // it, so the first save of a fresh session is never blocked by a claim nobody has made.
  private claimed: string | null = null;

  constructor(private readonly deps: RunOwnerDeps) {}

  /** What the runtime currently is, for `tokenMatches`. Read fresh every time — never cached. */
  context = (): RunContext => ({
    chatId: this.deps.openChatId(),
    storyId: this.deps.storyId(),
    playedVersion: this.deps.playedVersion(),
    sessionEpoch: this.epoch,
    windowRevision: this.windowRevision,
    lowestMutatedMessageId: this.lowestMutatedMessageId,
  });

  readonly ownership: RunOwnership = {
    mint: (window: MessageWindow | null = null) => mintToken(this.context(), window),
    check: (token: RunToken) => tokenMatches(this.context(), token),
    signal: () => this.signal(),
  };

  /**
   * Everything in flight now belongs to a world that no longer exists: a story load, select,
   * restart, clear, or a chat change. Callers pass no reason — the token check reports which
   * field moved, which is more useful than a label here.
   */
  private readonly changed = new Set<() => void>();
  /**
   * v2.3 plan 03. One controller per epoch, aborted when that epoch is replaced. Work started in
   * the old world is cancelled rather than left to finish and be discarded at the write edge.
   *
   * Only the judge path can honour it: SillyTavern ConnectionManagerRequestService.sendRequest
   * takes no signal (shared.js:423), so an extraction call cannot be cancelled at the host. For
   * those the token check is still the whole defence.
   */
  private aborter = new AbortController();

  /**
   * v2.3 plan 03: told when the world this owner describes is replaced, so queued work for the old
   * one can be dropped rather than run. Lives here because the epoch lives here.
   */
  onChanged(listener: () => void) {
    this.changed.add(listener);
    return () => { this.changed.delete(listener); };
  }

  /** The signal for work started now. It aborts when this epoch is replaced. */
  signal(): AbortSignal {
    return this.aborter.signal;
  }

  bump() {
    this.aborter.abort();
    this.aborter = new AbortController();
    this.epoch += 1;
    this.windowRevision = 0;
    this.lowestMutatedMessageId = null;
    // Every epoch belongs to exactly one chat: the one open when it was minted.
    this.claimed = this.deps.openChatId();
    // One bad listener must not strand the rest: a scheduler that never hears this keeps running
    // the previous world queue.
    for (const listener of this.changed) {
      try {
        listener();
      } catch (error) {
        console.warn("[Story Orchestrator] an epoch listener failed", error);
      }
    }
  }

  /** A swipe, edit or delete: the window a reader saw is no longer the window that exists. */
  noteMutation(messageId: number) {
    this.windowRevision += 1;
    this.lowestMutatedMessageId = this.lowestMutatedMessageId === null ? messageId : Math.min(this.lowestMutatedMessageId, messageId);
  }

  claimedChat(): string | null {
    return this.claimed;
  }

  /**
   * May this run write to the chat that is open? An unclaimed run may (it has taken nothing from
   * anyone); a run claimed by another chat may not, and declines rather than guessing — the
   * runtime for the open chat is the one entitled to write it.
   *
   * Nothing open means nothing to write to. On a page reload the runtime boots on the welcome
   * screen while `chat_metadata` still holds the previous chat's blob; a save there writes empty
   * state over that chat's own file, and the seed the next load needs is gone (J4, 2026-09-21).
   */
  ownsOpenChat(): boolean {
    const open = this.deps.openChatId();
    return Boolean(open) && (this.claimed === null || this.claimed === open);
  }
}
