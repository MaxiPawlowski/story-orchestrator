import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = import.meta.dirname;
const MEMBERS = [
  { id: 'brannock', name: 'Brannock' },
  { id: 'odessa', name: 'Odessa' },
  { id: 'perrin', name: 'Perrin' },
  { id: 'teodor', name: 'Teodor' },
];
const PLAYER = 'Bexley';
const ALL = MEMBERS.map((member) => member.id);
const SCENE2 = ['brannock', 'odessa', 'perrin'];

const pub = (speaker, text) => ({ speaker, text, heard: 'present' });
const aside = (speaker, text, heard, whisper = false) => ({ speaker, text, heard, whisper });
const mixed = (speaker, parts) => ({ speaker, parts });
const unknown = (speaker, text) => ({ speaker, text, heard: 'unknown' });

const scene1 = [
  pub(PLAYER, '"Everyone, gather round the fire. We cross the ridge at first light."'),
  pub('Brannock', 'Brannock stamps snow off his boots. "The ridge path is iced over past the second cairn."'),
  pub('Odessa', '"Then we rope up at the cairn and go slow," Odessa says to the group.'),
  aside('Perrin', 'Perrin leans toward Teodor and whispers, "I left the spare rope at the last camp."', ['perrin', 'teodor'], true),
  pub('Teodor', '"Then we share mine," Teodor answers aloud, patting the coil on his pack.'),
  pub(PLAYER, '"How many days of food do we have left?"'),
  pub('Odessa', 'Odessa counts the sacks. "Four days if nobody gets greedy."'),
  aside('Brannock', 'Brannock murmurs to Odessa alone, "Make it three. I saw tracks near the stores last night."', ['brannock', 'odessa']),
  pub('Odessa', 'Odessa nods once and says nothing to the others.'),
  mixed('Teodor', [
    { text: 'Teodor raises his voice for everyone: "The weather turns by noon tomorrow."', heard: 'present' },
    { text: 'Then, lower, only to Perrin: "And my knee will not last the descent."', heard: ['teodor', 'perrin'] },
  ]),
  pub('Perrin', '"We could wait a day at the hut," Perrin offers.'),
  pub(PLAYER, '"No waiting. The pass closes when the snow comes."'),
  pub('Brannock', 'Brannock hands over a folded map. "Mark the hut on this, just in case."'),
  aside('Odessa', 'Odessa catches Brannock by the sleeve and whispers, "The tracks were boots, not wolves."', ['odessa', 'brannock'], true),
  unknown('Teodor', 'Teodor mutters something into his scarf.'),
  pub('Perrin', 'Perrin stirs the pot. "Supper is ready, such as it is."'),
  aside('Brannock', 'Brannock signs to Teodor with two fingers: watch the north tree line.', ['brannock', 'teodor']),
  pub('Teodor', '"Understood," Teodor says, loud enough for all, and moves to the edge of camp.'),
  pub(PLAYER, '"Who takes first watch?"'),
  pub('Odessa', '"I will. Wake Perrin at midnight."'),
  mixed('Perrin', [
    { text: 'Perrin yawns. "Fine by me, I am exhausted."', heard: 'present' },
    { text: 'He slips Odessa a note that reads: the stores were opened from inside.', heard: ['perrin', 'odessa'] },
  ]),
  aside('Teodor', 'Teodor tells Brannock quietly, "I counted the sacks myself. One is missing."', ['teodor', 'brannock']),
];

const scene2 = [
  pub(PLAYER, '"Teodor has gone ahead to scout. The three of you, with me."'),
  pub('Brannock', '"The wind is picking up from the west," Brannock calls out.'),
  aside('Odessa', 'Odessa leans in to Perrin: "Do you trust Teodor with the map?"', ['odessa', 'perrin']),
  aside('Perrin', 'Perrin answers her under his breath, "Less than I did yesterday."', ['perrin', 'odessa']),
  pub(PLAYER, '"Keep moving. We talk at the hut."'),
  pub('Brannock', 'Brannock points at the slope ahead. "Avalanche scar. Single file from here."'),
  aside('Odessa', 'Odessa whispers to Brannock so Perrin cannot hear, "If he took the sack, he is hiding it in his bedroll."', ['odessa', 'brannock'], true),
  pub('Perrin', '"I can hear you two muttering," Perrin says with a crooked smile.'),
  pub(PLAYER, '"Enough. Eyes on the trail."'),
  mixed('Brannock', [
    { text: 'Brannock laughs it off. "Just the cold talking."', heard: 'present' },
    { text: 'He mouths a single word to Odessa: later.', heard: ['brannock', 'odessa'] },
  ]),
  pub('Perrin', 'Perrin slips on the ice and catches himself on an outstretched arm.'),
  pub('Odessa', '"Careful. One broken leg and we are finished," Odessa warns everyone.'),
  aside(PLAYER, 'Bexley murmurs to Perrin, "Stay close to me on the descent."', ['perrin']),
  pub('Perrin', '"Hut in sight!" Perrin shouts.'),
  pub('Brannock', 'Brannock kicks the hut door open and checks inside. "Empty. Dry wood, too."'),
  unknown('Odessa', 'Odessa says something by the door that the wind carries off.'),
  pub(PLAYER, '"Fire first, then food, then we talk."'),
  pub('Perrin', 'Perrin builds the fire while the others unpack.'),
  aside('Odessa', 'Odessa tells Bexley alone by the woodpile, "I think Teodor is honest. Someone wants us to doubt him."', ['odessa']),
  pub('Brannock', '"Teodor should be back before dark," Brannock says to everyone.'),
  aside('Perrin', 'Perrin pulls Brannock aside: "If he is not back by dark, we go without him."', ['perrin', 'brannock']),
  pub(PLAYER, '"Nobody goes anywhere without everyone. That is final."'),
];

const entries = [...scene1.map((entry) => ({ ...entry, present: ALL })), ...scene2.map((entry) => ({ ...entry, present: SCENE2 }))];
const resolve = (heard, present) => (heard === 'present' ? [...present] : heard);
const anchor = (text) => text.split(/\s+/).slice(0, 6).join(' ');

const messages = [];
const labels = [];
entries.forEach((entry, messageId) => {
  const text = entry.parts ? entry.parts.map((part) => part.text).join(' ') : entry.text;
  messages.push({ messageId, speaker: entry.speaker, text, ...(messageId % 9 === 4 ? { swipeId: 1 } : {}) });
  if (entry.parts) {
    let at = 0;
    const spans = entry.parts.map((part) => {
      const span = [at, at + part.text.length + (at + part.text.length < text.length ? 1 : 0)];
      at = span[1];
      return { span, heard: resolve(part.heard, entry.present) };
    });
    labels.push({ messageId, present: entry.present, heard: [...entry.present], spans, review: null });
  } else {
    labels.push({ messageId, present: entry.present, heard: entry.heard === 'unknown' ? 'unknown' : resolve(entry.heard, entry.present), review: null });
  }
});

const nameOf = (id) => MEMBERS.find((member) => member.id === id).name;
const goodLine = (entry, messageId) => {
  if (entry.parts) {
    return [`WITNESS m=${messageId} mixed`, ...entry.parts.map((part) => `SPAN m=${messageId} from="${anchor(part.text)}" heard=${part.heard === 'present' ? 'all-present' : part.heard.map(nameOf).join(',')}`)];
  }
  if (entry.heard === 'unknown') return [`WITNESS m=${messageId} heard=unknown`];
  if (messageId === 25) return [`WITNESS m=${messageId} heard=Perrin`];
  return [`WITNESS m=${messageId} heard=${entry.heard === 'present' ? 'all-present' : entry.heard.map((id, index) => (index % 2 ? id : nameOf(id))).join(',')}`];
};
const badLine = (entry, messageId) => [`WITNESS m=${messageId} heard=all-present`];

const WINDOWS = [[0, 7, ALL], [8, 15, ALL], [16, 21, ALL], [22, 29, SCENE2], [30, 37, SCENE2], [38, 43, SCENE2]];
const readsFile = (set, lineOf, extras) => ({
  format: 'so-witness-reads/1',
  set,
  synthetic: true,
  members: MEMBERS,
  messages,
  reads: [
    ...extras,
    ...WINDOWS.map(([from, to, present], index) => ({
      readId: `r${index + 1}`, from, to, status: 'accepted', present,
      response: ['DELTA none', ...entries.slice(from, to + 1).flatMap((entry, offset) => lineOf(entry, from + offset)), ...(index === 2 ? ['WITNESS m=99 heard=all-present'] : [])].join('\n'),
    })),
  ],
});

const write = (name, value) => writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 1)}\n`);

write('labels.json', { format: 'so-witness-labels/1', set: 'witness-synthetic', synthetic: true, members: ALL, labels });
write('reads-good.json', readsFile('witness-synthetic-good', goodLine, [{ readId: 'r0', from: 0, to: 7, status: 'outage', present: ALL, response: '' }]));
write('reads-all-present.json', readsFile('witness-synthetic-all-present', badLine, []));
