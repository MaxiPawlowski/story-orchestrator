import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { TIERS, type Card, type CardDoc } from './sessionCharters.mts';

export const DEFAULT_LANES = [1, 2, 3, 4];
export const LEASE_FILE = 'lease.json';

export interface LaneAssignment { card: string; tier: string; lane: number; order: number; seed: boolean; reason: string; waits: string | null }
export interface LaneReservation { lane: number; holder: string; until: string[]; fromTier?: string; untilTier?: string }
export interface LaneDependency { card: string; continues: string; root: string; lane: number }
export interface LaneWave { tier: string; lanes: Record<string, string[]> }
export interface LanePlan {
  lanes: number[]; assignments: LaneAssignment[]; queues: Record<string, string[]>; reservations: LaneReservation[]; problems: string[];
  dependencies?: LaneDependency[]; waves?: LaneWave[];
}

export const continuationsOf = (doc: CardDoc, id: string): Card[] => doc.cards.filter((card) => card.setup.chat === 'continue' && card.setup.continues === id);

export function dependentsOf(doc: CardDoc, id: string): Card[] {
  const out: Card[] = [];
  const queue = [id];
  const seen = new Set<string>([id]);
  while (queue.length) {
    for (const next of continuationsOf(doc, queue.shift()!)) {
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      out.push(next);
      queue.push(next.id);
    }
  }
  return out;
}

const tierRank = (tier: string) => (TIERS as readonly string[]).indexOf(tier);

export function executionOrder(doc: CardDoc, cards: Card[]): Card[] {
  const position = new Map(doc.cards.map((card, at) => [card.id, at]));
  return [...cards].sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || position.get(a.id)! - position.get(b.id)!);
}

export const rootOf = (doc: CardDoc, card: Card): Card => {
  let current = card;
  const seen = new Set<string>();
  while (current.setup.chat === 'continue' && current.setup.continues && !seen.has(current.id)) {
    seen.add(current.id);
    const previous = doc.cards.find((candidate) => candidate.id === current.setup.continues);
    if (!previous) break;
    current = previous;
  }
  return current;
};

export function planLanes(doc: CardDoc, lanes: number[] = DEFAULT_LANES, only: string[] | null = null): LanePlan {
  const problems: string[] = [];
  const cards = executionOrder(doc, only ? doc.cards.filter((card) => only.includes(card.id)) : doc.cards);
  for (const card of cards) {
    const previous = card.setup.chat === 'continue' ? doc.cards.find((candidate) => candidate.id === card.setup.continues) : undefined;
    if (previous && tierRank(previous.tier) > tierRank(card.tier)) problems.push(`${card.id} (${card.tier}) continues ${previous.id} (${previous.tier}), which runs in a later tier`);
  }
  const load = new Map(lanes.map((lane) => [lane, 0]));
  const laneOf = new Map<string, number>();
  const pending = new Map<number, { holder: string; until: Set<string> }>();
  const reservations: LaneReservation[] = [];
  const assignments: LaneAssignment[] = [];
  cards.forEach((card, order) => {
    const waits = card.waits ?? null;
    if (card.setup.chat === 'continue' && card.setup.continues) {
      const root = rootOf(doc, card);
      const lane = laneOf.get(card.setup.continues) ?? laneOf.get(root.id);
      if (lane === undefined) {
        problems.push(`${card.id} continues ${card.setup.continues}, which is not in this plan`);
        return;
      }
      laneOf.set(card.id, lane);
      load.set(lane, (load.get(lane) ?? 0) + 1);
      assignments.push({ card: card.id, tier: card.tier, lane, order, seed: false, reason: `continues ${card.setup.continues} on its lane`, waits });
      const hold = pending.get(lane);
      if (hold) {
        hold.until.delete(card.id);
        for (const next of continuationsOf(doc, card.id)) if (cards.includes(next)) hold.until.add(next.id);
        if (!hold.until.size) pending.delete(lane);
      }
      return;
    }
    const free = lanes.filter((lane) => !pending.has(lane));
    if (!free.length) {
      problems.push(`${card.id}: every lane holds a chat a later card continues (${[...pending.entries()].map(([lane, hold]) => `lane ${lane}: ${hold.holder} for ${[...hold.until].join(', ')}`).join('; ')})`);
      return;
    }
    const lane = free.reduce((best, candidate) => ((load.get(candidate) ?? 0) < (load.get(best) ?? 0) ? candidate : best), free[0]);
    laneOf.set(card.id, lane);
    load.set(lane, (load.get(lane) ?? 0) + 1);
    assignments.push({ card: card.id, tier: card.tier, lane, order, seed: true, reason: 'fresh: seeds its lane with adolion-fresh', waits });
    const later = continuationsOf(doc, card.id).filter((next) => cards.includes(next));
    if (later.length) {
      pending.set(lane, { holder: card.id, until: new Set(later.map((next) => next.id)) });
      const last = dependentsOf(doc, card.id).filter((next) => cards.includes(next)).reduce((max, next) => (tierRank(next.tier) > tierRank(max) ? next.tier : max), card.tier);
      reservations.push({ lane, holder: card.id, until: later.map((next) => next.id), fromTier: card.tier, untilTier: last });
    }
  });
  const queues = Object.fromEntries(lanes.map((lane) => [String(lane), assignments.filter((row) => row.lane === lane).map((row) => row.card)]));
  const laneOfCard = new Map(assignments.map((row) => [row.card, row.lane]));
  const rootId = (card: Card) => rootOf(doc, card).id;
  const dependencies: LaneDependency[] = cards.filter((card) => card.setup.chat === 'continue' && laneOfCard.has(card.id))
    .map((card) => ({ card: card.id, continues: card.setup.continues!, root: rootId(card), lane: laneOfCard.get(card.id)! }));
  const waves: LaneWave[] = TIERS.map((tier) => ({
    tier,
    lanes: Object.fromEntries(lanes.map((lane) => [String(lane), assignments.filter((row) => row.lane === lane && row.tier === tier).map((row) => row.card)]).filter(([, ids]) => (ids as string[]).length)),
  })).filter((wave) => Object.keys(wave.lanes).length);
  return { lanes, assignments, queues, reservations, problems, dependencies, waves };
}

export function planDrift(written: LanePlan | null, fresh: LanePlan): string[] {
  if (!written) return ['test/sessions/lane-plan.json is missing: run so-session plan --write'];
  const strip = (plan: LanePlan) => JSON.stringify({ lanes: plan.lanes, assignments: plan.assignments, reservations: plan.reservations, dependencies: plan.dependencies ?? null, waves: plan.waves ?? null });
  return strip(written) === strip(fresh) ? [] : ['test/sessions/lane-plan.json does not match the cards: run so-session plan --write'];
}

export function dependencyRefusal(doc: CardDoc, card: Card, sessions: SessionOnLane[]): string | null {
  if (card.setup.chat !== 'continue' || !card.setup.continues) return null;
  const previous = sessions.filter((session) => session.charter === card.setup.continues);
  if (!previous.length) return null;
  if (!previous.some((session) => session.stoppedAt)) return `${card.id} continues ${card.setup.continues}, whose session has not been stopped: stop it first so its chat and evidence are settled.`;
  return null;
}

export interface Lease { lane: number; holder: string; session: string; chats: string[]; dependents: string[]; writtenAt: string }

export function outstandingDependents(lease: Lease | null, sessions: SessionOnLane[]): string[] {
  if (!lease) return [];
  const played = new Set(sessions.filter((session) => session.stoppedAt).map((session) => session.charter));
  return lease.dependents.filter((id) => !played.has(id));
}

export function leaseRefusal(lease: Lease | null, sessions: SessionOnLane[], forCard: string | null): string | null {
  const waiting = outstandingDependents(lease, sessions).filter((id) => id !== forCard);
  if (!lease || !waiting.length) return null;
  return `lane ${lease.lane} is leased: it holds the ${lease.holder} chat (${lease.chats.join(', ') || 'no chat recorded'}) that ${waiting.join(', ')} still continue${waiting.length === 1 ? 's' : ''}. Play them first, archive the lane (so-session lane archive ${lease.lane}), or pass --break-lease.`;
}

export function leaseFor(doc: CardDoc, card: Card, lane: number, session: string, chats: string[], sessions: SessionOnLane[], now = new Date().toISOString()): Lease | null {
  const played = new Set(sessions.filter((entry) => entry.stoppedAt).map((entry) => entry.charter));
  const dependents = dependentsOf(doc, card.id).map((next) => next.id).filter((id) => !played.has(id));
  return dependents.length ? { lane, holder: card.id, session, chats, dependents, writtenAt: now } : null;
}

export const leasePath = (laneRoot: string) => resolve(laneRoot, LEASE_FILE);

export async function readLease(laneRoot: string): Promise<Lease | null> {
  const path = leasePath(laneRoot);
  if (!existsSync(path)) return null;
  try { return JSON.parse(await readFile(path, 'utf-8')); } catch { return null; }
}

export async function writeLease(laneRoot: string, lease: Lease | null) {
  if (lease) await writeFile(leasePath(laneRoot), JSON.stringify(lease, null, 2), 'utf-8');
  else await rm(leasePath(laneRoot), { force: true });
}

export async function sessionsUnder(root: string): Promise<SessionOnLane[]> {
  const found: SessionOnLane[] = [];
  if (!existsSync(root)) return found;
  for (const tier of await readdir(root)) {
    if (!/^T\d$/.test(tier)) continue;
    for (const name of await readdir(resolve(root, tier))) {
      const path = resolve(root, tier, name, 'session.json');
      if (existsSync(path)) found.push(JSON.parse(await readFile(path, 'utf-8')));
    }
  }
  return found;
}

export const ARCHIVED_PARTS = ['data', 'adolion-fresh', LEASE_FILE] as const;

async function listFiles(root: string, base = root): Promise<Array<{ path: string; bytes: number }>> {
  if (!existsSync(root)) return [];
  const info = await stat(root);
  if (info.isFile()) return [{ path: relative(base, root).replace(/\\/g, '/'), bytes: info.size }];
  const out: Array<{ path: string; bytes: number }> = [];
  for (const entry of await readdir(root)) out.push(...await listFiles(join(root, entry), base));
  return out;
}

export async function laneManifest(laneRoot: string) {
  const files = (await Promise.all(ARCHIVED_PARTS.map((part) => listFiles(join(laneRoot, part), laneRoot)))).flat().sort((a, b) => a.path.localeCompare(b.path));
  return { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), list: files };
}

export async function archiveLane(laneRoot: string, archiveDir: string, label: Record<string, unknown>) {
  if (existsSync(archiveDir)) throw new Error(`${archiveDir} already exists`);
  await mkdir(archiveDir, { recursive: true });
  for (const part of ARCHIVED_PARTS) if (existsSync(join(laneRoot, part))) await cp(join(laneRoot, part), join(archiveDir, part), { recursive: true });
  const before = await laneManifest(laneRoot);
  const after = await laneManifest(archiveDir);
  const manifest = { ...label, archivedAt: new Date().toISOString(), from: laneRoot, files: before.files, bytes: before.bytes };
  await writeFile(join(archiveDir, 'archive.json'), JSON.stringify({ ...manifest, list: before.list }, null, 2), 'utf-8');
  if (after.files !== before.files || after.bytes !== before.bytes) throw new Error(`archive of ${laneRoot} is incomplete: ${after.files}/${before.files} files, ${after.bytes}/${before.bytes} bytes`);
  return manifest;
}

export async function restoreLane(archiveDir: string, laneRoot: string) {
  const record = JSON.parse(await readFile(join(archiveDir, 'archive.json'), 'utf-8'));
  for (const part of ARCHIVED_PARTS) await rm(join(laneRoot, part), { recursive: true, force: true });
  await mkdir(laneRoot, { recursive: true });
  for (const part of ARCHIVED_PARTS) if (existsSync(join(archiveDir, part))) await cp(join(archiveDir, part), join(laneRoot, part), { recursive: true });
  const restored = await laneManifest(laneRoot);
  const expected = JSON.stringify(record.list);
  if (JSON.stringify(restored.list) !== expected) throw new Error(`restore of ${archiveDir} into ${laneRoot} does not match the archive (${restored.files}/${record.files} files)`);
  return { files: restored.files, bytes: restored.bytes, lease: record.lease ?? null };
}

export interface SessionOnLane { charter: string; lane: number; stoppedAt?: string | null; startedAt?: string }

export function reseedRefusal(doc: CardDoc, lane: number, sessions: SessionOnLane[], cardId: string): string | null {
  const played = new Set(sessions.map((session) => session.charter));
  for (const session of sessions.filter((candidate) => Number(candidate.lane) === lane)) {
    const waiting = dependentsOf(doc, session.charter).filter((next) => next.id !== cardId && !played.has(next.id));
    if (waiting.length) return `lane ${lane} holds the ${session.charter} chat that ${waiting.map((next) => next.id).join(' and ')} continue${waiting.length === 1 ? 's' : ''}; seeding it for ${cardId} would destroy that chat. Play ${waiting.map((next) => next.id).join(', ')} first, or pick another lane.`;
  }
  return null;
}

export function laneFor(plan: LanePlan | null, cardId: string): number | null {
  return plan?.assignments.find((row) => row.card === cardId)?.lane ?? null;
}

export const JUDGE_ACCOUNT_RATE_PER_MIN = 90;
export const JUDGE_ACCOUNT_RATE_ENV = 'SO_JUDGE_ACCOUNT_RATE_PER_MIN';
export const JUDGE_LANE_RATE_ENV = 'SO_JUDGE_RATE_PER_MIN';
export const JUDGE_LANE_RATE_MIN = 10;
export const JUDGE_LANE_RATE_MAX = 60;
export const JUDGE_LANE_OVERCOMMIT = 2;

export interface JudgeRate { perMinute: number; lanes: number; running: number[]; account: number; source: 'arg' | 'derived' }

const positiveInt = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const laneJudgeRate = (lanes: number, account = JUDGE_ACCOUNT_RATE_PER_MIN) =>
  Math.max(JUDGE_LANE_RATE_MIN, Math.min(JUDGE_LANE_RATE_MAX, Math.floor((account * JUDGE_LANE_OVERCOMMIT) / Math.max(1, Math.floor(lanes)))));

export function judgeRatePlan(lane: number, running: number[], { requested = null, env = {} }: { requested?: unknown; env?: Record<string, string | undefined> } = {}): JudgeRate {
  const lanes = [...new Set([...running, lane])].sort((a, b) => a - b);
  const account = positiveInt(env[JUDGE_ACCOUNT_RATE_ENV]) ?? JUDGE_ACCOUNT_RATE_PER_MIN;
  const asked = positiveInt(requested);
  return { perMinute: asked ?? laneJudgeRate(lanes.length, account), lanes: lanes.length, running: lanes, account, source: asked ? 'arg' : 'derived' };
}

export function loadedJudgeRate(log: string): number | null {
  const found = [...log.matchAll(/\[story-orchestrator-judge\] loaded;[^\n]*per user (\d+)\/min/g)];
  return found.length ? Number(found[found.length - 1][1]) : null;
}

const pidAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

export async function runningLanes(lanesRoot: string, alive: (pid: number) => boolean = pidAlive): Promise<number[]> {
  if (!existsSync(lanesRoot)) return [];
  const lanes: number[] = [];
  for (const name of (await readdir(lanesRoot)).filter((entry) => /^\d+$/.test(entry))) {
    const pid = Number((await readFile(join(lanesRoot, name, 'server.pid'), 'utf-8').catch(() => '')).trim());
    if (Number(name) > 0 && Number.isInteger(pid) && pid > 0 && alive(pid)) lanes.push(Number(name));
  }
  return lanes.sort((a, b) => a - b);
}
