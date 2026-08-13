import { renderNarrativeHtml, type NarrativeStatus } from "./narrative";

export const AWAY_RECAP_MIN_MS = 8 * 60 * 60 * 1000;

export interface AwayRecap {
  title: string;
  lines: string[];
  html: string;
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
// popup (plan 04): same sections, same wording — only the heading knows you were away.
export function buildAwayRecap(narrative: NarrativeStatus, gapMs: number): AwayRecap {
  const title = `Welcome back — ${narrative.title} (away ${formatGap(gapMs)})`;
  const lines = narrative.sections.map((section) => `${section.label}\n${section.lines.join("\n")}`);
  return { title, lines, html: renderNarrativeHtml(narrative, title) };
}

// Detected when a story is loaded, shown once when the chat is actually on screen — the runtime
// only tells it when the session was last seen and what the narrative says now.
export class AwayRecapController {
  private pending: AwayRecap | null = null;

  constructor(private readonly showPopup: (html: string) => Promise<void>) {}

  detect(priorSessionAt: string | null, narrative: NarrativeStatus, now = Date.now()) {
    this.pending = shouldShowAwayRecap(priorSessionAt, now)
      ? buildAwayRecap(narrative, now - Date.parse(priorSessionAt as string))
      : null;
  }

  get(): AwayRecap | null { return this.pending; }

  async show(): Promise<boolean> {
    const recap = this.pending;
    if (!recap) return false;
    this.pending = null;
    await this.showPopup(recap.html);
    return true;
  }
}
