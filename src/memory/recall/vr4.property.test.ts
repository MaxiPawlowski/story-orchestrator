import { syntheticRecallFixture } from "../../../test/support/recallKit";
import { sameRevision } from "../audience";
import { revisionOf } from "../witness/contract";
import { witnessRevision } from "../witness/record";
import { replayWitnessReads } from "../witness/replay";
import { rollbackWitness } from "../witness/state";
import type { WitnessRecordState } from "../witness/types";
import { loadRecallSession, type FixtureMessage, type LoadedSession } from "./fixture";
import { selectRecall } from "./select";

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const SEEDS = [11, 23, 37, 59];
const loaded = loadRecallSession(syntheticRecallFixture().sessions[0]);

const run = (session: LoadedSession, chat: FixtureMessage[], witness: WitnessRecordState) => session.cases.map(({ fixtureCase, pool }) => {
  const member = session.session.roster.find((entry) => entry.id === fixtureCase.member) as { id: string; name: string };
  return selectRecall(pool.map((entry) => entry.candidate), { member: { id: member.id, names: [member.name] }, chat, witness, tellings: session.tellings, secrets: session.secrets },
    { roster: session.session.roster, playerName: session.session.player });
});

const mutate = (chat: FixtureMessage[], random: () => number) => {
  const touched = new Set<number>();
  const next = chat.flatMap((entry): FixtureMessage[] => {
    const roll = random();
    if (roll > 0.3) return [entry];
    touched.add(entry.messageId);
    if (roll < 0.075) return [];
    if (roll < 0.15) return [{ ...entry, hidden: true }];
    if (roll < 0.225) return [{ ...entry, swipeId: (entry.swipeId ?? 0) + 1, text: `${entry.text} (another take)` }];
    return [{ ...entry, text: `${entry.text}!` }];
  });
  return { chat: next, touched };
};

describe("plan 43 VR4: a swiped, edited, deleted or hidden span never returns; witness rollback ≡ replay at the recall level", () => {
  it.each(SEEDS)("seed %i: every returned line is live at its recorded revision, none from a touched message", (seed) => {
    const random = mulberry32(seed);
    const { chat, touched } = mutate(loaded.chat, random);
    const selections = run(loaded, chat, loaded.witness);
    const lines = selections.flatMap((selection) => selection.lines);
    expect(touched.size).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const message = chat.find((entry) => entry.messageId === line.candidate.source.messageId);
      expect(message && !message.hidden && sameRevision(line.candidate.source.revision, revisionOf(message))).toBe(true);
      expect(touched.has(line.candidate.source.messageId)).toBe(false);
    }
    const refusedTouched = selections.flatMap((selection) => selection.refused).filter((refusal) => touched.has(refusal.candidate.source.messageId));
    expect(refusedTouched.length).toBeGreaterThan(0);
  });

  it.each(SEEDS)("seed %i: recall after rollbackWitness equals recall over a replay of the kept reads", (seed) => {
    const random = mulberry32(seed * 7919);
    const reads = loaded.session.reads;
    const cut = reads[1 + Math.floor(random() * (reads.length - 1))].from + Math.floor(random() * 4);
    const chat = loaded.chat.filter((entry) => entry.messageId < cut);
    const rolled = rollbackWitness(loaded.witness, cut);
    const replayed = replayWitnessReads(reads.filter((entry) => entry.to < cut), loaded.session.messages, loaded.session.roster).state;
    const view = (witness: WitnessRecordState) => run(loaded, chat, witness).map((selection) => selection.lines.map((line) => line.line));
    expect(view(rolled)).toEqual(view(replayed));
    expect(view(rolled).flat().length).toBeGreaterThan(0);
    expect(witnessRevision(rolled)).not.toBe(witnessRevision(loaded.witness));
  });
});
