// v2.3 plan 03 — one ownership token for every asynchronous write.
//
// R1 and C1 are one defect with several faces: a unit of work reads the world, awaits a model, and
// then writes through accessors that resolve to whatever chat is current *now*. A curator pass
// started in chat A lands its proposal in chat B; a lore selection forces entries for a story that
// is no longer loaded; a judge call is recorded in the wrong chat's ring. Comparing the last
// message index was not enough — two chats sitting at index 7 compare equal.
//
// So a task mints a token when it starts and re-checks it immediately before it writes. The token
// is the whole identity of the work: which chat, which story at which version, which run of the
// runtime, and which window of messages the answer was computed from.

export interface MessageWindow {
  from: number;
  to: number;
}

export interface RunToken {
  chatId: string | null;
  storyId: string | null;
  playedVersion: number | null;
  /** Bumped by the manager on loadStory, select, restart, clear, CHAT_CHANGED and stop. */
  sessionEpoch: number;
  /** The window the work read. `null` for work that does not read the transcript. */
  window: MessageWindow | null;
  /** Per chat; bumped when a message is edited, deleted or swiped. */
  windowRevision: number;
}

export type TokenMismatch = "chat" | "story" | "version" | "epoch" | "window";

export type TokenCheck = { ok: true } | { ok: false; reason: TokenMismatch; detail: string };

/** What the runtime currently is. The manager owns every field; this module only compares them. */
export interface RunContext {
  chatId: string | null;
  storyId: string | null;
  playedVersion: number | null;
  sessionEpoch: number;
  windowRevision: number;
  /**
   * The lowest message index mutated since the token was minted, or null if none were. A reply
   * appended after the window is not a mutation and does not appear here.
   */
  lowestMutatedMessageId?: number | null;
  lowestMutatedSince?: (windowRevision: number) => number | null;
  /** v2.4 plan 02 §3: the chat the current epoch was minted in, for telling a same-chat reload from a switch. */
  claimedChat?: string | null;
}

export function mintToken(current: RunContext, window: MessageWindow | null = null): RunToken {
  return {
    chatId: current.chatId,
    storyId: current.storyId,
    playedVersion: current.playedVersion,
    sessionEpoch: current.sessionEpoch,
    window: window ? { from: window.from, to: window.to } : null,
    windowRevision: current.windowRevision,
  };
}

const ok: TokenCheck = { ok: true };

/**
 * May this result still be written?
 *
 * The window rule is the subtle one. A read over `[0, 7]` is invalid if message 5 was edited while
 * it ran — its answer describes text that no longer exists. A reply *appended* at message 8 is
 * harmless: the answer is still true about messages 0 to 7, and discarding it would throw away
 * every read that raced an ordinary turn, which is most of them. So `windowRevision` alone does
 * not decide: the work is discarded only when something at or below its own `window.to` moved.
 */
export function tokenMatches(current: RunContext, token: RunToken): TokenCheck {
  if (current.sessionEpoch !== token.sessionEpoch) {
    return { ok: false, reason: "epoch", detail: `the runtime restarted (epoch ${token.sessionEpoch} → ${current.sessionEpoch})` };
  }
  if (current.chatId !== token.chatId) {
    return { ok: false, reason: "chat", detail: `this result belongs to chat ${String(token.chatId)}, the open chat is ${String(current.chatId)}` };
  }
  if (current.storyId !== token.storyId) {
    return { ok: false, reason: "story", detail: `this result belongs to story ${String(token.storyId)}, the chat now plays ${String(current.storyId)}` };
  }
  if (current.playedVersion !== token.playedVersion) {
    return { ok: false, reason: "version", detail: `the story moved from version ${String(token.playedVersion)} to ${String(current.playedVersion)} while this ran` };
  }
  if (current.windowRevision !== token.windowRevision && token.window) {
    const lowest = current.lowestMutatedSince ? current.lowestMutatedSince(token.windowRevision) : current.lowestMutatedMessageId;
    // Unknown which message moved: the conservative reading is that it could have been inside the
    // window. "We did not record it" is not "it was outside".
    if (lowest === null || lowest === undefined) {
      return { ok: false, reason: "window", detail: "the transcript was edited while this ran and the mutation point was not recorded" };
    }
    if (lowest <= token.window.to) {
      return { ok: false, reason: "window", detail: `message ${lowest} was edited while this ran, inside the window [${token.window.from}, ${token.window.to}] it read` };
    }
  }
  return ok;
}

/** A one-line reason for the journal and for a discarded-result row. */
export const describeMismatch = (check: TokenCheck): string => (check.ok ? "" : `${check.reason}: ${check.detail}`);

/**
 * What a coordinator is given so it can mint and check tokens without knowing where the runtime
 * keeps its identity. Every asynchronous writer takes one of these.
 */
export interface RunOwnership {
  mint: (window?: MessageWindow | null) => RunToken;
  check: (token: RunToken) => TokenCheck;
  /** v2.3 plan 03: aborts when the epoch this work started in is replaced. */
  signal?: () => AbortSignal;
}

/**
 * A run in progress: minted once at the top of an asynchronous unit, asked again immediately
 * before each write.
 *
 * Why a handle rather than a `withToken(fn)` wrapper. The fifty sites this has to cover do not
 * share one shape — several write more than once, between more than one await; some write to
 * `extras` and also call a host effect; some write from a `catch` or a `finally`. A wrapper that
 * owns the control flow would have to grow an option for each of those, and the one thing it
 * cannot express is the common case: *check again, here, before this particular write*. A handle
 * puts the check exactly where the write is, which is the only place it means anything.
 */
export interface RunGuard {
  /** True while the world this run started in is still the current one. */
  stillOwns(): boolean;
  /** Which field moved, or null while the run is still valid. Use it to journal a discard. */
  lapsed(): TokenMismatch | null;
  /** The same, with detail, for a log line. */
  lapsedDetail(): string | null;
}

/**
 * Begin a run. `ownership` is optional so a caller that has not been wired yet — and every test
 * written before this existed — keeps working: an unowned run never lapses. That is deliberately
 * permissive, and it is why `ownership.guard.test.ts` tracks which sites actually check rather
 * than trusting that a guard exists somewhere.
 */
export function beginRun(ownership: RunOwnership | undefined, window: MessageWindow | null = null): RunGuard {
  const token = ownership?.mint(window) ?? null;
  const verdict = (): TokenCheck => (token && ownership ? ownership.check(token) : { ok: true });
  return {
    stillOwns: () => verdict().ok,
    lapsed: () => {
      const check = verdict();
      return check.ok ? null : check.reason;
    },
    lapsedDetail: () => {
      const check = verdict();
      return check.ok ? null : describeMismatch(check);
    },
  };
}
