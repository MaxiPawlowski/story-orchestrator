import { isNoteOp, type CuratorEntryView, type CuratorOp, type CuratorOpRecord, type WiCuratorOp } from "./types";
import { declineKey } from "./proposal";
import { viewForOp } from "./scope";

export const DECLINE_MEMORY_BOUNDARIES = 32;
export const DECLINE_MEMORY_LIMIT = 24;

export interface CuratorDecline {
  key: string;
  op: WiCuratorOp;
  boundary: number;
  entry?: string;
}

const entrySignature = (entry: { content: string; disabled: boolean }): string =>
  `${entry.disabled ? "off" : "on"}:${entry.content.replace(/\s+/g, " ").trim()}`;

const unexpired = (declines: CuratorDecline[], boundary: number) =>
  declines.filter((decline) => boundary - decline.boundary < DECLINE_MEMORY_BOUNDARIES);

export const rememberDecline = (declines: CuratorDecline[], entry: CuratorOpRecord, boundary: number): CuratorDecline[] => {
  if (isNoteOp(entry.op)) return declines;
  const key = declineKey(entry.op);
  const decline: CuratorDecline = { key, op: entry.op, boundary, ...(entry.before ? { entry: entrySignature(entry.before) } : {}) };
  return [...unexpired(declines, boundary).filter((kept) => kept.key !== key), decline].slice(-DECLINE_MEMORY_LIMIT);
};

export const forgetDecline = (declines: CuratorDecline[], op: CuratorOp): CuratorDecline[] => {
  if (isNoteOp(op)) return declines;
  const key = declineKey(op);
  return declines.some((decline) => decline.key === key) ? declines.filter((decline) => decline.key !== key) : declines;
};

export const standingDeclines = (declines: CuratorDecline[], entries: CuratorEntryView[], boundary: number): WiCuratorOp[] =>
  unexpired(declines, boundary).filter((decline) => {
    const view = viewForOp(entries, decline.op);
    if (!view) return false;
    return decline.entry === undefined || entrySignature(view) === decline.entry;
  }).map((decline) => decline.op);

export const mergeDeclined = (...lists: WiCuratorOp[][]): WiCuratorOp[] => {
  const seen = new Set<string>();
  return lists.flat().filter((op) => {
    const key = declineKey(op);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const sanitizeDeclines = (value: unknown): CuratorDecline[] =>
  Array.isArray(value)
    ? value.filter((decline): decline is CuratorDecline => Boolean(decline) && typeof decline.key === "string" && typeof decline.boundary === "number"
        && Boolean(decline.op) && typeof decline.op.kind === "string" && decline.op.kind !== "note").slice(-DECLINE_MEMORY_LIMIT)
    : [];
