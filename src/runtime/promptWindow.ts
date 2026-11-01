import { isRecord } from "@utils/guards";

export const PROBE_MIN_CHARS = 12;
export const PROBE_CHARS = 48;

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

export const messageProbe = (row: unknown): string | null => {
  if (!isRecord(row) || row.is_system === true || typeof row.mes !== "string") return null;
  const line = row.mes.split(/\r?\n/).map(squash).reduce((best, next) => (next.length > best.length ? next : best), "");
  if (line.length < PROBE_MIN_CHARS) return null;
  const start = Math.max(0, Math.floor((line.length - PROBE_CHARS) / 2));
  return line.slice(start, start + PROBE_CHARS);
};

export function oldestInWindow(prompt: string, rows: readonly unknown[]): number | null {
  const text = squash(prompt);
  let oldest: number | null = null;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const probe = messageProbe(rows[index]);
    if (probe === null) continue;
    if (!text.includes(probe)) break;
    oldest = index;
  }
  return oldest;
}

export class PromptWindow {
  private oldest: number | null = null;

  observe(oldest: number | null): void {
    this.oldest = oldest;
  }

  from(): number | null {
    return this.oldest;
  }

  reset(): void {
    this.oldest = null;
  }
}

export const promptWindow = new PromptWindow();
