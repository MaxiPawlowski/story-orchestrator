import { awayRecapTitle, renderNarrativeNode, type NarrativeStatus } from "./narrative";

export const AWAY_RECAP_MIN_MS = 8 * 60 * 60 * 1000;

export interface AwayRecap {
  title: string;
  lines: string[];
  render: (doc: Document) => HTMLElement;
}

const formatGap = (ms: number): string => {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `${Math.max(1, hours)}h`;
  return `${Math.floor(hours / 24)}d`;
};

export function shouldShowAwayRecap(lastSessionAt: string | null, now: number, minMs = AWAY_RECAP_MIN_MS): boolean {
  if (!lastSessionAt) return false;
  const last = Date.parse(lastSessionAt);
  if (Number.isNaN(last)) return false;
  return now - last >= minMs;
}

// Returning after a gap shows the standing player composition, not a second one written for the
// popup: same sections, same wording — only the heading knows you were away.
const RECAP_SKIPS = new Set(["about", "pending"]);

export function buildAwayRecap(narrative: NarrativeStatus, gapMs: number): AwayRecap {
  const title = awayRecapTitle(narrative.title, formatGap(gapMs));
  const recap = { ...narrative, sections: narrative.sections.filter((section) => !RECAP_SKIPS.has(section.id)) };
  const lines = recap.sections.map((section) => `${section.label}\n${section.lines.join("\n")}`);
  return { title, lines, render: (doc) => renderNarrativeNode(recap, doc, title) };
}

export interface RecapPopupHandle {
  close: () => void;
}

interface ScopedRecap {
  recap: AwayRecap;
  chatId: string;
}

// Detected when a story is loaded, shown once when the chat is actually on screen — the runtime
// only tells it when the session was last seen and what the narrative says now.
export class AwayRecapController {
  private pending: ScopedRecap | null = null;
  private open: (ScopedRecap & { handle: RecapPopupHandle }) | null = null;

  constructor(
    private readonly showPopup: (render: (doc: Document) => HTMLElement) => RecapPopupHandle,
    private readonly note: (summary: string, detail: string) => void = () => undefined,
  ) {}

  detect(priorSessionAt: string | null, narrative: NarrativeStatus, chatId: string, now = Date.now()) {
    const show = shouldShowAwayRecap(priorSessionAt, now);
    this.pending = show ? { recap: buildAwayRecap(narrative, now - Date.parse(priorSessionAt as string)), chatId } : null;
    // The journal records the decision, not just the outcome: "no recap" and "a recap nobody saw"
    // are different answers, and only the machine can tell them apart.
    this.note(
      `away recap ${show ? "queued" : "not due"}`,
      `chat ${chatId || "(unnamed)"}, last seen ${priorSessionAt ?? "never"}, gap ${priorSessionAt ? `${Math.round((now - Date.parse(priorSessionAt)) / 3600000)}h` : "n/a"}`,
    );
  }

  get(): AwayRecap | null { return this.pending?.recap ?? null; }

  show(): boolean {
    const pending = this.pending;
    if (!pending) return false;
    this.pending = null;
    this.closeOpen();
    this.open = { ...pending, handle: this.showPopup(pending.recap.render) };
    this.note("away recap shown", `chat ${pending.chatId || "(unnamed)"}`);
    return true;
  }

  /**
   * Take the recap down when the chat it was computed for is no longer the one on screen.
   *
   * The popup is a host modal, so while it is up the whole document is inert to a pointer. It
   * describes one chat, so once another chat is open it is not merely stale copy — it blocks that
   * chat outright. Measured a recap raised for a House Nightriver chat survived
   * `/newchat`, a group switch and a story switch, and `#send_but` hit-tested as `blocked: overlay`
   * behind it in an Adventurer's Road chat with zero messages.
   *
   * Scoped rather than unconditional on purpose. A page reload loads the same chat twice (the
   * bootstrap and the host's CHAT_CHANGED), and the first load's save stamps `lastSessionAt`, so the
   * second can never re-detect the gap — dismissing on every load would take the recap down and
   * never put it back.
   */
  dismissUnless(chatId: string) {
    // A chat the host has not named yet is not evidence of a mismatch. A page load passes through
    // states where `chatId` is empty while the real chat is already being opened, and closing on
    // those would take the recap down exactly when it is meant to appear.
    if (!chatId) return;
    const open = this.open;
    if (open?.chatId && open.chatId !== chatId) {
      this.closeOpen();
      this.note("away recap taken down", `it described chat ${open.chatId}, the open chat is ${chatId}`);
    }
    const pending = this.pending;
    if (pending?.chatId && pending.chatId !== chatId) {
      this.pending = null;
      this.note("away recap dropped", `it was computed for chat ${pending.chatId}, the open chat is ${chatId}`);
    }
  }

  private closeOpen() {
    this.open?.handle.close();
    this.open = null;
  }
}
