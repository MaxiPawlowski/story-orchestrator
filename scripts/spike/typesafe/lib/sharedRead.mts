import { buildMiniStory, worlds, type Message, type WorldDef } from './story.mts';
import { tryBaseline } from './baseline.mts';
import { buildFixtureRun, parseSharedReadResponse, stripReasoningBlocks } from './prod.mts';

const ANCHOR_QUALITY: Record<string, { checkpoint: string; quality: string }> = {
  'sun-ruins': { checkpoint: 'cp-5', quality: 'artifact_secured' },
  ship: { checkpoint: 'reactor', quality: 'reactor_state' },
  noir: { checkpoint: 'ledger', quality: 'ledger_found' },
  manor: { checkpoint: 'gallery', quality: 'portrait_moved' },
};

export function worldForSpeakers(speakers: string[]): WorldDef {
  const all = worlds();
  const hit = Object.values(all).find((world) => speakers.some((speaker) => world.roster.some((member) => member.name === speaker)));
  return hit ?? all['sun-ruins'];
}

export async function sharedReadBaseline(world: WorldDef, transcript: Message[], tag: string, openArcs?: string[]) {
  const anchor = ANCHOR_QUALITY[world.id];
  const story = buildMiniStory(world, anchor.checkpoint, [anchor.quality]);
  const run = buildFixtureRun({ story, transcript, activeCheckpointId: anchor.checkpoint, ...(openArcs ? { openArcs } : {}) });
  const call = await tryBaseline(run.prompt, 512, tag);
  if (!call) return null;
  const raw = stripReasoningBlocks(call.raw);
  return { raw, parsed: parseSharedReadResponse(raw, run.story), latencyMs: call.latencyMs };
}
