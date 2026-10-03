import { beginRun, type RunGuard, type RunOwnership } from "./runToken";

// Requirements used to be re-read only at commit, activate, load and rollback, so a
// player who switched to the persona a story asks for, enabled the member or selected the lorebook
// waited a whole turn for the story to notice, and the checkpoint's effects waited with it. The host
// says when each of those changes: PERSONA_CHANGED (personas.js:166), GROUP_UPDATED,
// WORLDINFO_SETTINGS_UPDATED and CHARACTER_EDITED for a card's bound book (events.js:44). Binding the chat
// lorebook slot emits nothing (world-info.js:5973-5984), so the next GENERATION_STARTED re-reads it. A burst
// of them (a persona switch saves settings and may reload the chat) is one refresh, 250 ms after the last.

export const REQUIREMENTS_DEBOUNCE_MS = 250;

export const behindActive = (lastApplied: string | null | undefined, active: { id: string } | undefined): boolean => Boolean(active) && lastApplied !== active?.id;

export interface RequirementsReading {
  before: boolean;
  after: boolean;
  /** The active checkpoint's effects have not been applied in this chat yet. */
  behind: boolean;
}

export interface RequirementsHost {
  /** Re-reads the requirements; null when no story is loaded. */
  refresh: () => RequirementsReading | null;
  /** Applies the active checkpoint in `hydrate` mode: staging only, no onEnter replies. */
  hydrate: () => Promise<unknown>;
  persist: () => Promise<unknown>;
  notify: () => void;
  ownership: RunOwnership;
}

export type RequirementsRefresh = "no-story" | "unchanged" | "refreshed" | "hydrated" | "lapsed";

/** Only not-ready → ready takes the effects the chat was owed. Ready → not-ready undoes nothing. */
export const hydrateDue = (reading: RequirementsReading) => !reading.before && reading.after && reading.behind;

export async function refreshRequirementsNow(host: RequirementsHost, run: RunGuard = beginRun(host.ownership)): Promise<RequirementsRefresh> {
  if (!run.stillOwns()) return "lapsed";
  const reading = host.refresh();
  if (!reading) return "no-story";
  if (!hydrateDue(reading)) {
    host.notify();
    return reading.before === reading.after ? "unchanged" : "refreshed";
  }
  await host.hydrate();
  if (!run.stillOwns()) return "lapsed";
  await host.persist();
  if (!run.stillOwns()) return "lapsed";
  host.notify();
  return "hydrated";
}

type Subscribe = (entries: Array<{ eventName: string; handler: () => void }>) => () => void;

export type RequirementsSource = (handler: () => void) => () => void;

export class RequirementsWatch {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private run: RunGuard | null = null;
  private unsubscribe: (() => void) | null = null;
  private last: Promise<RequirementsRefresh> | null = null;

  constructor(
    private readonly host: RequirementsHost,
    private readonly subscribe: Subscribe,
    private readonly delayMs = REQUIREMENTS_DEBOUNCE_MS,
    private readonly sources: RequirementsSource[] = [],
  ) {}

  start() {
    if (this.unsubscribe) return;
    const handler = () => this.schedule();
    const stops = this.sources.map((source) => source(handler));
    const events = this.subscribe([
      { eventName: "PERSONA_CHANGED", handler },
      { eventName: "GROUP_UPDATED", handler },
      { eventName: "WORLDINFO_SETTINGS_UPDATED", handler },
      { eventName: "CHARACTER_EDITED", handler },
      { eventName: "GENERATION_STARTED", handler },
    ]);
    this.unsubscribe = () => {
      events();
      stops.forEach((stop) => stop());
    };
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.run = null;
  }

  /** The token is minted when the host speaks: a chat left inside the debounce refreshes nothing for it. */
  schedule() {
    this.run = beginRun(this.host.ownership);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fire(), this.delayMs);
  }

  /** The refresh the last debounce started, for a caller that needs to wait on it. */
  settled(): Promise<RequirementsRefresh> | null { return this.last; }

  private fire() {
    const run = this.run;
    this.timer = null;
    this.run = null;
    if (run) this.last = refreshRequirementsNow(this.host, run);
  }
}
