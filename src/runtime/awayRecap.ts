export const AWAY_RECAP_MIN_MS = 8 * 60 * 60 * 1000;

export interface AwayRecapInput {
  storyTitle: string | null;
  activeCheckpointName: string | null;
  activeObjective: string | null;
  openArcs: string[];
  canon: string;
  tensionLevel: string | null;
  gapMs: number;
}

export interface AwayRecap {
  title: string;
  lines: string[];
  html: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const excerpt = (value: string, max: number): string => (value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`);

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

export function buildAwayRecap(input: AwayRecapInput): AwayRecap {
  const lines: string[] = [];
  lines.push(`Checkpoint: ${input.activeCheckpointName ?? "(none)"}${input.activeObjective ? ` — ${input.activeObjective}` : ""}`);
  if (input.tensionLevel) lines.push(`Tension: ${input.tensionLevel}`);
  if (input.openArcs.length) lines.push(`Open threads:\n${input.openArcs.map((arc) => `• ${arc}`).join("\n")}`);
  const canon = input.canon.trim();
  if (canon) lines.push(`Canon so far:\n${excerpt(canon, 600)}`);
  const title = `Welcome back — ${input.storyTitle ?? "your story"} (away ${formatGap(input.gapMs)})`;
  const html = `<h3 style="margin-top:0">${escapeHtml(title)}</h3><div style="text-align:left;white-space:pre-wrap">${escapeHtml(lines.join("\n\n"))}</div>`;
  return { title, lines, html };
}
