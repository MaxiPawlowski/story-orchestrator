import type { Card, CardDoc } from './sessionCharters.mts';

export const DEFAULT_LANES = [1, 2, 3, 4];

export interface LaneAssignment { card: string; tier: string; lane: number; order: number; seed: boolean; reason: string; waits: string | null }
export interface LaneReservation { lane: number; holder: string; until: string[] }
export interface LanePlan { lanes: number[]; assignments: LaneAssignment[]; queues: Record<string, string[]>; reservations: LaneReservation[]; problems: string[] }

export const continuationsOf = (doc: CardDoc, id: string): Card[] => doc.cards.filter((card) => card.setup.chat === 'continue' && card.setup.continues === id);

const rootOf = (doc: CardDoc, card: Card): Card => {
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
  const cards = only ? doc.cards.filter((card) => only.includes(card.id)) : doc.cards;
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
      reservations.push({ lane, holder: card.id, until: later.map((next) => next.id) });
    }
  });
  const queues = Object.fromEntries(lanes.map((lane) => [String(lane), assignments.filter((row) => row.lane === lane).map((row) => row.card)]));
  return { lanes, assignments, queues, reservations, problems };
}

export interface SessionOnLane { charter: string; lane: number; stoppedAt?: string | null; startedAt?: string }

export function reseedRefusal(doc: CardDoc, lane: number, sessions: SessionOnLane[], cardId: string): string | null {
  const played = new Set(sessions.map((session) => session.charter));
  for (const session of sessions.filter((candidate) => Number(candidate.lane) === lane)) {
    const waiting = continuationsOf(doc, session.charter).filter((next) => next.id !== cardId && !played.has(next.id));
    if (waiting.length) return `lane ${lane} holds the ${session.charter} chat that ${waiting.map((next) => next.id).join(' and ')} continue${waiting.length === 1 ? 's' : ''}; seeding it for ${cardId} would destroy that chat. Play ${waiting.map((next) => next.id).join(', ')} first, or pick another lane.`;
  }
  return null;
}

export function laneFor(plan: LanePlan | null, cardId: string): number | null {
  return plan?.assignments.find((row) => row.card === cardId)?.lane ?? null;
}
