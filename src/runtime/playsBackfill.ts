import { isRecord } from "@utils/guards";
import type { PlayRow } from "./playsIndex";

export const BACKFILL_CAP = 200;
export const BACKFILL_INTERVAL_MS = 1500;

export interface BackfillTarget {
  groupId: string;
  chatId: string;
}

export interface BackfillState {
  done: boolean;
  pending: BackfillTarget[];
  scanned: number;
}

const isTarget = (value: unknown): value is BackfillTarget => isRecord(value) && typeof value.groupId === "string" && Boolean(value.groupId)
  && typeof value.chatId === "string" && Boolean(value.chatId);

export const sanitizeBackfill = (value: unknown): BackfillState | null => {
  if (!isRecord(value)) return null;
  return {
    done: value.done === true,
    pending: Array.isArray(value.pending) ? value.pending.filter(isTarget).slice(0, BACKFILL_CAP).map(({ groupId, chatId }) => ({ groupId, chatId })) : [],
    scanned: typeof value.scanned === "number" && Number.isFinite(value.scanned) && value.scanned >= 0 ? value.scanned : 0,
  };
};

export const planBackfill = (groups: ReadonlyArray<{ id: string; chats: readonly string[] }>, indexed: ReadonlySet<string>): BackfillState => {
  const pending = groups.flatMap((group) => [...group.chats].reverse().map((chatId) => ({ groupId: group.id, chatId })))
    .filter((target) => !indexed.has(target.chatId))
    .slice(0, BACKFILL_CAP);
  return { done: pending.length === 0, pending, scanned: 0 };
};

export interface BackfillDeps {
  alive(): boolean;
  generating(): boolean;
  read(target: BackfillTarget): Promise<PlayRow | null>;
  write(chatId: string, row: PlayRow): void;
  save(state: BackfillState): void;
  wait(ms: number): Promise<void>;
}

export async function runBackfill(state: BackfillState, deps: BackfillDeps): Promise<BackfillState> {
  let current = state;
  while (!current.done && deps.alive()) {
    if (deps.generating()) {
      await deps.wait(BACKFILL_INTERVAL_MS);
      continue;
    }
    const [target, ...rest] = current.pending;
    if (!target) {
      current = { ...current, done: true };
      deps.save(current);
      break;
    }
    const row = await deps.read(target);
    if (!deps.alive()) break;
    if (row) deps.write(target.chatId, row);
    current = { done: rest.length === 0, pending: rest, scanned: current.scanned + 1 };
    deps.save(current);
    if (!current.done) await deps.wait(BACKFILL_INTERVAL_MS);
  }
  return current;
}
