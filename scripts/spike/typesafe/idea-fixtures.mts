import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './lib/client.mts';

const save = (name: string, rows: unknown[]) => writeFileSync(join(PROJECT_ROOT, 'test/fixtures/judge', `spike-${name}.json`), `${JSON.stringify({ revision: 1, source: 'Authored English synthetic holdout; labels frozen before evaluation. No campaign evidence.', rows }, null, 2)}\n`);
const tasks = ['repair the clock', 'decode the letter', 'treat the burn', 'chart the river', 'inspect the lock', 'identify the coin', 'translate the inscription', 'track the wagon', 'test the water', 'mend the sail'];
save('cast-balance', tasks.flatMap((task, index) => [
  { id: `CB${index * 2 + 1}`, player: 'Player', cast: [{ name: 'Expert', role: `The only specialist able to ${task}` }, { name: 'Guide', role: 'Guides the group; has no specialist knowledge' }], turns: [{ speaker: 'Player', text: `Expert, can you ${task}?` }, { speaker: 'Guide', text: 'I will answer for Expert. There is no need to let Expert speak.' }, { speaker: 'Player', text: 'I asked Expert. Please let them answer.' }, { speaker: 'Guide', text: 'No. I will answer every question, even questions for Expert.' }], labels: { Expert: 'under', Guide: 'over' } },
  { id: `CB${index * 2 + 2}`, player: 'Player', cast: [{ name: 'Expert', role: `The specialist able to ${task}` }, { name: 'Guide', role: 'Guides the group and watches the approach' }], turns: [{ speaker: 'Player', text: `Expert, can you ${task}?` }, { speaker: 'Expert', text: 'Yes. Here is what I found and what we need to do.' }, { speaker: 'Player', text: 'Guide, is the approach safe?' }, { speaker: 'Guide', text: 'Yes. I checked it; we can proceed.' }], labels: { Expert: 'fine', Guide: 'fine' } },
]));
const goals = ['recover the missing ledger', 'reach the lighthouse', 'rescue the stranded crew', 'find the lost courier', 'negotiate a ceasefire', 'restore the water supply', 'solve the theft', 'deliver the medicine', 'repair the bridge', 'locate the observatory'];
save('hop2', goals.flatMap((goal, index) => [true, false].map((toward) => ({
  id: `H${index * 2 + (toward ? 1 : 2)}`, input: { storyTitle: 'The Expedition', checkpointName: 'Planning', objective: 'Choose the next destination', player: 'Player', cast: [{ rosterId: 'guide', name: 'Guide', role: 'Expedition guide' }], reachable: [{ id: 'prepare', name: 'Preparation', objective: 'Gather supplies', hops: 1 }, { id: 'target', name: 'The mission', objective: goal, hops: 2 }, { id: 'rest', name: 'Rest', objective: 'Abandon the mission and settle here', hops: 2 }], window: [{ speaker: 'Player', text: toward ? `We are going to ${goal}. Gather the supplies so we can do that next.` : `We will not ${goal}. Abandon that mission; we are settling here permanently.` }, { speaker: 'Guide', text: toward ? `Agreed. Our destination is to ${goal}; first we gather supplies.` : 'Agreed. No more missions; this is our permanent home.' }], families: { sceneBreak: false, tracker: false, lookahead: true } }, heading: { target: toward, rest: !toward },
}))));
const toneRows = [
  ['A sober account of grief, with restrained language.', 'The bereaved family stood silently beside the empty chair.', 4],
  ['A sober account of grief, with restrained language.', 'The narrator made a fart joke at the funeral and called grief hilarious.', 0],
  ['A playful comedy of harmless misunderstandings.', 'They swapped identical hats and argued cheerfully over whose ears were warmer.', 4],
  ['A playful comedy of harmless misunderstandings.', 'The narrator dwelt on mutilation and hopeless torture.', 0],
  ['A tense espionage scene with suspicion and secrecy.', 'She checked the corridor before sliding the coded note beneath the door.', 4],
  ['A tense espionage scene with suspicion and secrecy.', 'Everyone sang a nursery rhyme and forgot there had ever been a secret.', 0],
  ['A gentle domestic story about caring for one another.', 'He warmed the soup and left a blanket where she could reach it.', 4],
  ['A gentle domestic story about caring for one another.', 'The narrator praised cruelty and mocked everyone for offering help.', 0],
  ['A wonder-filled exploration of unfamiliar landscapes.', 'Blue light drifted through the crystal grove as they traced its branching paths.', 4],
  ['A wonder-filled exploration of unfamiliar landscapes.', 'The narrator dismissed the entire landscape as boring and refused to describe it.', 0],
  ['A restrained mystery, patient observation over spectacle.', 'A faint watermark offered the first quiet clue.', 4],
  ['A restrained mystery, patient observation over spectacle.', 'An explosion solved every mystery while the narrator shouted jokes.', 0],
  ['A hopeful adventure about cooperation.', 'They shared their tools and found a route together.', 4],
  ['A hopeful adventure about cooperation.', 'Cooperation was pointless, the narrator declared; betrayal was the only virtue.', 0],
  ['A melancholic recollection of a lost friendship.', 'The faded letter still carried the shape of an old kindness.', 4],
  ['A melancholic recollection of a lost friendship.', 'The lost friendship was turned into a loud advertisement for cheap boots.', 0],
  ['A grounded survival scene without slapstick.', 'They rationed the remaining water and repaired the shelter before dark.', 4],
  ['A grounded survival scene without slapstick.', 'The shelter bounced away on cartoon legs while everyone laughed.', 0],
  ['A tender reunion after a long separation.', 'She took his hand and waited until he could speak.', 4],
  ['A tender reunion after a long separation.', 'The narrator sneered at affection and turned the reunion into a sales pitch.', 0],
];
save('tone', toneRows.map(([intent, reply, level], index) => ({ id: `T${index + 1}`, intent, reply, level })));
const phrases = ['the air held its breath', 'a smile that did not reach his eyes', 'the silence stretched between them', 'something shifted in the shadows', 'her fingers tightened on the cup', 'the room seemed to grow smaller', 'a weight settled on his shoulders', 'the moment hung like a thread', 'his voice was barely a whisper', 'the world narrowed to that sound'];
save('repetition', phrases.flatMap((phrase, index) => [
  { id: `R${index * 2 + 1}`, replies: [`${phrase}. They opened the door.`, `${phrase}. A cart passed.`, `${phrase}. Someone waited.`, `${phrase}. The bell rang.`, 'They read the letter.', `${phrase}. They began again.`], label: 'loops', hot: [phrase] },
  { id: `R${index * 2 + 2}`, replies: ['The door opened onto a sunlit courtyard.', 'A merchant counted the remaining coins.', 'Rain washed the chalk from the wall.', 'The messenger handed over a sealed letter.', 'They checked the map beside the lamp.', `${phrase}.`], label: 'fresh', hot: [] },
]));
