import { loadEntry } from './bundleEntry.mts';
import { g14Story, type G14Fixture } from './g14Promotion.mts';
import { okKey, S8_CLAUSE, s8Story, type S8Fixture } from './q7Failure.mts';
import { hearsayMarker, voicingStory, type VoicingFixture } from './rumorVoicing.mts';
import type { Cast } from './replyCapture.mts';

export const loadFixtureKit = () => loadEntry<any>('scripts/debug/lib/fixtureStoryEntry.ts');

const parsed = async (kit: any, story: unknown) => {
  await kit.loadGameLayer();
  const result = kit.parseStory(story);
  if (Array.isArray(result)) throw new Error(result.map((error: { path: string; message: string }) => `${error.path}: ${error.message}`).join('; '));
  return result;
};

const spreadOnce = (kit: any, story: any, state: any, values: Record<string, unknown>, boundary: number) => kit.spreadRumors({
  state, net: story.rumorNet, life: story.life?.members ?? [], values, at: { boundary, messageId: boundary }, chatId: 'sim-chat', storyId: story.storyId ?? story.id,
  enabled: story.roster.map((member: { id: string }) => member.id), secretFor: () => ({ barred: false, entryIds: [] }), revision: null, horizonMessageId: null,
}).state;

const nameOf = (story: any) => (id: string) => story.roster.find((member: { id: string; name: string }) => member.id === id)?.name ?? id;

export async function simulateVoicing(kit: any, fixture: VoicingFixture, cast: Cast) {
  const problems: string[] = [];
  for (const entry of fixture.cases) {
    try {
      const story = await parsed(kit, voicingStory(entry, cast));
      let state = kit.createRumors();
      const characterLines = entry.transcript.slice(0, -1).filter((line) => line.speaker !== 'player').length;
      for (let boundary = 1; boundary <= characterLines; boundary += 1) state = spreadOnce(kit, story, state, {}, boundary);
      const lines: string[] = kit.hearsayLines(state, 'receiver', nameOf(story));
      if (!lines.some((line) => line.includes(hearsayMarker(entry)))) problems.push(`${entry.id}: the hearsay line did not land by the invite (${JSON.stringify(lines)})`);
    } catch (error) {
      problems.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { cases: fixture.cases.length, problems };
}

export async function simulateG14(kit: any, fixture: G14Fixture, cast: Cast) {
  const story = await parsed(kit, g14Story(fixture, cast));
  let state = kit.createRumors();
  const values: Record<string, unknown> = {};
  let boundary = 0;
  for (const turn of fixture.turns) {
    boundary += 1;
    state = spreadOnce(kit, story, state, values, boundary);
    for (const command of turn.cp ?? []) {
      const [key, raw] = command.split(' ');
      values[key] = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
      boundary += 1;
      state = spreadOnce(kit, story, state, values, boundary);
    }
  }
  const landedAt = state.hearsay.map((row: { rumorId: string; told: { messageId: number } }) => ({ rumorId: row.rumorId, boundary: row.told.messageId }));
  return { hearsay: state.hearsay.length, expected: fixture.expectHearsay, landedAt, claims: state.hearsay.map((row: { claim: string }) => row.claim), problems: state.hearsay.length === fixture.expectHearsay ? [] : [`${state.hearsay.length} hearsay row(s) landed in simulation, expected ${fixture.expectHearsay}`] };
}

export async function simulateS8(kit: any, fixture: S8Fixture, cast: Cast) {
  const problems: string[] = [];
  if (!String(kit.CHECK_OUTCOME_HEADER).includes(S8_CLAUSE)) problems.push('the shipped CHECK_OUTCOME_HEADER no longer carries the S8 clause the runner checks for');
  for (const entry of fixture.cases) {
    try {
      const story = await parsed(kit, s8Story(entry, cast));
      const check = story.checkpointById?.scene?.checks?.[0] ?? story.checkpoints.find((cp: { id: string }) => cp.id === 'scene')?.checks?.[0];
      if (!check || check.quality !== okKey(entry)) { problems.push(`${entry.id}: the parsed story has no scene check writing ${okKey(entry)}`); continue; }
      if ((check.roll.dice ?? 1) * check.roll.sides >= check.roll.target) problems.push(`${entry.id}: the check can succeed`);
      const block = kit.checkOutcomeBlock(story, [{ checkId: entry.check.id, boundary: 1, messageId: 1, visit: 0, draws: [check.roll.sides], modifiers: [], total: check.roll.sides, target: check.roll.target, outcome: 'failure' }], 1);
      if (!block?.includes(`${entry.check.label}: fails.`)) problems.push(`${entry.id}: the outcome block does not read "${entry.check.label}: fails." (${JSON.stringify(block)})`);
    } catch (error) {
      problems.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { cases: fixture.cases.length, problems };
}
