import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = import.meta.dirname;
const ROSTER = [
  { id: 'corvin', name: 'Corvin' },
  { id: 'tamsin', name: 'Tamsin' },
  { id: 'hollis', name: 'Hollis' },
  { id: 'orrin', name: 'Orrin' },
];
const PLAYER = 'Marlo';
const ALL = ROSTER.map((member) => member.id);
const nameOf = (id) => (id === 'player' ? PLAYER : ROSTER.find((member) => member.id === id).name);

const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const random = mulberry32(0x43ec);
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nonce = () => `NX-${Array.from({ length: 6 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join('')}`;

const PUBLIC = [
  ['ferry', 'The ferry leaves at the second bell, and the pilot will not wait for stragglers.'],
  ['lantern', 'Keep the green lantern lit at the bow so the lock keeper knows we paid.'],
  ['mule', 'The grey mule bites if you stand on her left side, so load her from the right.'],
  ['bridge', 'The old bridge holds two riders at a time, never three.'],
  ['well', 'Draw water from the east well only; the west one went brackish in spring.'],
  ['inn', 'The inn at the crossroads charges double after dark, so we arrive before sunset.'],
  ['boots', 'Oil your boots tonight or the marsh will rot the stitching by Thursday.'],
  ['dice', 'I lost the bone dice to a tinker in the last village, so no games tonight.'],
  ['bell', 'If you hear the chapel bell ring three times, head straight back to camp.'],
  ['rope', 'Coil the rope over your shoulder, not around your waist, when we climb.'],
  ['salt', 'Ration the salt pork; the next market is six days downriver.'],
  ['song', 'My grandmother sang that song to keep wolves away from the sheep pens.'],
  ['map', 'The map is wrong past the mill; the road bends north, not south.'],
  ['fever', 'Boil the willow bark for the fever and give it to him at dawn and dusk.'],
  ['toll', 'The toll at the gate is four copper a head, and the guard counts twice.'],
  ['horse', 'The bay horse threw a shoe near the ford, so walk her the last mile.'],
  ['knife', 'Never lend your knife to a stranger at the fair; it is bad luck and worse manners.'],
  ['ice', 'The lake ice is safe only near the reeds where the water runs shallow.'],
  ['letter', 'Deliver the sealed letter to the reeve himself and to no clerk.'],
  ['fire', 'Bank the fire with ash before we sleep so the embers last until morning.'],
  ['owl', 'An owl calling in daylight means weather is coming over the hills.'],
  ['cart', 'The cart axle squeals because the pin is bent; I will fix it at the smithy.'],
  ['apples', 'Pick only the red apples from the low branches; the high ones are wormy.'],
  ['river', 'The river rises fast after rain upstream, so camp above the willow line.'],
];

const ASIDES = [
  ['strongbox', 'The strongbox code is {N}; tell no one else.'],
  ['signal', 'Leave the signal {N} chalked on the mill door if you need me.'],
  ['ledger', 'My real name is on the ledger under {N}, not the one I gave the reeve.'],
  ['password', 'The password at the dock is {N}.'],
  ['purse', 'I hid the spare purse behind the stone marked {N}.'],
  ['burn', 'If I am taken, burn the letter numbered {N}.'],
  ['cellar', 'The cellar lock answers to the word {N}.'],
  ['passage', 'Ask the ferryman for passage {N}; he will know who sent you.'],
  ['debt', 'The debt I owe is written in the book as {N}.'],
  ['stall', 'Meet me at the stall with the sign {N} at noon.'],
  ['token', 'The token that opens the north gate reads {N}.'],
  ['brother', 'The message from my brother was signed {N}.'],
  ['brand', 'The horse we sold was branded {N} under the mane.'],
  ['tally', 'The tally stick for the grain store is notched {N}.'],
  ['cousin', 'My cousin in the city answers letters addressed to {N}.'],
  ['beacon', 'The safe crossing tonight is marked {N} on the beacon.'],
  ['coin', 'Pay the guard with the coin stamped {N}, not the others.'],
  ['ring', 'The ring I pawned carries the mark {N}.'],
  ['knock', 'The healer opens only to the knock pattern {N}.'],
  ['crates', 'The river pilot logged our crates as {N}.'],
  ['route', 'Burn the map once you have learned the route {N}.'],
  ['deposit', 'The innkeeper keeps our deposit under the name {N}.'],
  ['favor', 'The bargeman owes me a favor; say the word {N} to him.'],
  ['tower', 'The tower key is filed under {N} at the reeve hall.'],
];

const PAIRS = [['corvin', 'tamsin'], ['hollis', 'corvin'], ['tamsin', 'hollis'], ['orrin', 'corvin'], ['tamsin', 'orrin'], ['hollis', 'orrin']];
const ACTIONS = ['rubs a sore shoulder', 'glances at the sky', 'tightens a strap', 'pokes at the fire', 'shakes out a cloak', 'checks the packs'];
const QUERIES = [
  (name, topic) => `What exactly did ${name} say about the ${topic}?`,
  (name, topic) => `What did ${name} say about the ${topic}?`,
  (name, topic) => `Tell me word for word what ${name} told us about the ${topic}.`,
  (name, topic) => `Can you quote ${name} on the ${topic}?`,
];

function builder(chatId) {
  const messages = [];
  const lines = new Map();
  const say = (speaker, text, heard, options = {}) => {
    const messageId = options.messageId ?? messages.length;
    const isUser = speaker === 'player';
    messages.push({
      messageId, speaker: nameOf(speaker), isUser, text, heard, ...(options.nonce ? { nonce: options.nonce } : {}),
      ...(options.hidden ? { hidden: true } : {}), ...(options.swipeId !== undefined ? { swipeId: options.swipeId } : {}),
    });
    const heardList = (list) => (list.length === ALL.length ? 'all-present' : list.map((id, index) => (index % 2 ? id : nameOf(id))).join(','));
    if (options.read === 'unknown') lines.set(messageId, [`WITNESS m=${messageId} heard=unknown`]);
    else if (options.parts) lines.set(messageId, [`WITNESS m=${messageId} mixed`, ...options.parts.map((part) => `SPAN m=${messageId} from="${part.text.split(/\s+/).slice(0, 4).join(' ')}" heard=${heardList(part.heard)}`)]);
    else lines.set(messageId, [`WITNESS m=${messageId} heard=${heardList(heard)}`]);
    return messageId;
  };
  const reads = () => {
    const out = [];
    for (let from = 0; from < messages.length; from += 8) {
      const to = Math.min(from + 7, messages.length - 1);
      out.push({ readId: `${chatId}-r${out.length + 1}`, from, to, status: 'accepted', present: ALL, response: ['DELTA none', ...Array.from({ length: to - from + 1 }, (_, offset) => lines.get(from + offset)).flat()].join('\n') });
    }
    return out;
  };
  return { messages, say, reads };
}

const quoted = (speaker, quote, index) => (speaker === 'player' ? `"${quote}"` : `${nameOf(speaker)} ${ACTIONS[index % ACTIONS.length]}. "${quote}"`);
const asideText = (speaker, other, quote) => `${nameOf(speaker)} leans close to ${nameOf(other)} and murmurs, "${quote}"`;

function commonScenes(b, offset) {
  const publics = PUBLIC.slice(offset, offset + 12).map(([topic, quote], index) => {
    const speaker = index % 6 === 5 ? 'player' : ALL[index % 4];
    return { topic, quote, speaker, messageId: b.say(speaker, quoted(speaker, quote, index), ALL) };
  });
  const asides = ASIDES.slice(offset, offset + 12).map(([topic, template], index) => {
    const marker = nonce();
    const quote = template.replace('{N}', marker);
    const [speaker, other] = PAIRS[index % PAIRS.length];
    return { topic, quote, speaker, heard: [speaker, other], messageId: b.say(speaker, asideText(speaker, other, quote), [speaker, other], { nonce: marker }) };
  });
  return { publics, asides };
}

function standardCases(prefix, publics, asides) {
  const cases = [];
  publics.slice(0, 11).forEach((line, index) => {
    const member = ALL[(index + 1) % 4] === line.speaker ? ALL[(index + 2) % 4] : ALL[(index + 1) % 4];
    const fillers = publics.filter((other) => other !== line).slice(index % 3, (index % 3) + 3);
    const gold = { messageId: line.messageId, quote: line.quote, role: 'gold' };
    const pool = index % 2 ? [...fillers.slice(0, 1).map((other) => ({ messageId: other.messageId, quote: other.quote, role: 'filler' })), gold, ...fillers.slice(1).map((other) => ({ messageId: other.messageId, quote: other.quote, role: 'filler' }))]
      : [gold, ...fillers.map((other) => ({ messageId: other.messageId, quote: other.quote, role: 'filler' }))];
    const query = line.speaker === 'player' ? `What did I say about the ${line.topic}? Quote me exactly.` : QUERIES[index % QUERIES.length](nameOf(line.speaker), line.topic);
    cases.push({ id: `${prefix}-pos-${String(index + 1).padStart(2, '0')}`, kind: 'positive', member, query, pool });
  });
  asides.slice(0, 11).forEach((line, index) => {
    const keptOut = ALL.filter((id) => !line.heard.includes(id));
    const member = keptOut[index % keptOut.length];
    const fillers = publics.slice(index % 4, (index % 4) + 2).map((other) => ({ messageId: other.messageId, quote: other.quote, role: 'filler' }));
    cases.push({
      id: `${prefix}-exc-${String(index + 1).padStart(2, '0')}`, kind: 'exclusion', member,
      query: `What exactly did ${nameOf(line.speaker)} whisper about the ${line.topic}?`, pool: [{ messageId: line.messageId, quote: line.quote, role: 'nonce' }, ...fillers],
    });
  });
  return cases;
}

function sessionA() {
  const b = builder('chat-recall-a');
  const { publics, asides } = commonScenes(b, 0);
  const knifeNonce = nonce();
  const supper = 'Supper at dusk, everyone.';
  const knife = `Bring the knife marked ${knifeNonce}.`;
  const mixedParts = [{ text: `Corvin calls to the whole camp, "${supper}"`, heard: ALL }, { text: `Then, quietly to Orrin: "${knife}"`, heard: ['corvin', 'orrin'] }];
  const mixedId = b.say('corvin', mixedParts.map((part) => part.text).join(' '), ['corvin', 'orrin'], { parts: mixedParts, nonce: knifeNonce });
  const tollOrigin = 'The reeve has doubled the bridge toll since the flood.';
  const tollTelling = 'Hollis told me the reeve has doubled the bridge toll since the flood.';
  const originId = b.say('hollis', `Hollis lowers her voice to Corvin, "${tollOrigin}"`, ['hollis', 'corvin']);
  const tellingId = b.say('corvin', `Corvin turns to Tamsin at the cart. "${tollTelling}"`, ['corvin', 'tamsin']);
  const saltOrigin = 'The ferryman takes bribes in salt, not silver.';
  const saltTelling = 'Orrin says the ferryman takes bribes in salt, not silver.';
  const saltOriginId = b.say('orrin', `Orrin leans close to Hollis and murmurs, "${saltOrigin}"`, ['orrin', 'hollis']);
  const saltTellingId = b.say('hollis', `Hollis catches Tamsin by the fire. "${saltTelling}"`, ['hollis', 'tamsin'], { read: 'unknown' });
  const mapSecret = 'I sold the family map to the toll keeper for passage money.';
  const mapId = b.say('corvin', `Corvin leans close to Hollis and murmurs, "${mapSecret}"`, ['corvin', 'hollis']);
  const cupSecret = 'A pinch in her cup was all it took.';
  const cupId = b.say('orrin', `Orrin whispers to no one but himself, "${cupSecret}"`, ['orrin']);
  const hiddenQuote = 'We split the reward four ways, no matter who finds it.';
  const hiddenId = b.say('tamsin', `Tamsin raises her mug. "${hiddenQuote}"`, ALL, { hidden: true });
  const staleOld = 'The ford is passable until the full moon.';
  const staleNew = 'The ford is passable until the new moon, not after.';
  const staleId = b.say('hollis', `Hollis studies the water. "${staleNew}"`, ALL, { swipeId: 1 });
  const fogQuote = 'Something moved in the fog by the reeds.';
  const fogId = b.say('orrin', `Orrin squints into the grey. "${fogQuote}"`, ALL, { read: 'unknown' });
  const removedId = 900;
  const removedText = 'Tamsin shrugs. "The old shrine pays a silver for every wolf pelt."';
  const extra = publics.slice(0, 5).map((line) => ({ messageId: line.messageId, quote: line.quote, role: 'filler' }));
  const orrinOut = asides.filter((line) => !line.heard.includes('orrin')).slice(0, 4);
  const cases = [
    ...standardCases('a', publics, asides),
    { id: 'a-exc-mixed', kind: 'exclusion', member: 'tamsin', query: 'What exactly did Corvin tell Orrin about the knife?', pool: [{ messageId: mixedId, quote: knife, role: 'nonce' }, extra[0]] },
    { id: 'a-pos-mixed', kind: 'positive', member: 'orrin', query: 'Orrin, what exactly did Corvin ask you to bring?', pool: [{ messageId: mixedId, quote: knife, role: 'gold' }, extra[1]] },
    { id: 'a-told-01', kind: 'told', member: 'tamsin', query: 'Tamsin, what did Hollis say about the toll? Word for word.', pool: [{ messageId: originId, quote: tollOrigin, role: 'origin' }, { messageId: tellingId, quote: tollTelling, role: 'telling' }, extra[2]] },
    { id: 'a-told-02', kind: 'told', member: 'tamsin', query: 'What exactly did Orrin say about the ferryman?', pool: [{ messageId: saltOriginId, quote: saltOrigin, role: 'origin' }, { messageId: saltTellingId, quote: saltTelling, role: 'telling' }] },
    { id: 'a-told-03', kind: 'told', member: 'orrin', query: 'What did Hollis say about the toll? Exactly, please.', pool: [{ messageId: originId, quote: tollOrigin, role: 'origin' }, { messageId: tellingId, quote: tollTelling, role: 'forbidden' }, extra[3]] },
    { id: 'a-secret-01', kind: 'secret', member: 'tamsin', query: 'What exactly did Corvin say about the family map?', pool: [{ messageId: mapId, quote: mapSecret, role: 'secret' }, extra[0]] },
    { id: 'a-secret-02', kind: 'secret', member: 'orrin', query: 'Quote what Corvin said about the map.', pool: [{ messageId: mapId, quote: mapSecret, role: 'secret' }, extra[1]] },
    { id: 'a-secret-03', kind: 'secret', member: 'tamsin', query: 'What exactly did Orrin say over the cups?', pool: [{ messageId: cupId, quote: cupSecret, role: 'secret' }, extra[2]] },
    { id: 'a-secret-04', kind: 'secret', member: 'hollis', query: 'Hollis, what did Orrin say about her cup? Word for word.', pool: [{ messageId: cupId, quote: cupSecret, role: 'secret' }, extra[3]] },
    {
      id: 'a-vr2k-01', kind: 'vr2k', member: 'orrin', query: 'Orrin, what exactly has everyone said about the road so far?',
      pool: [
        ...orrinOut.map((line) => ({ messageId: line.messageId, quote: line.quote, role: 'forbidden' })),
        { messageId: hiddenId, quote: hiddenQuote, role: 'forbidden' },
        { messageId: staleId, quote: staleOld, indexedMessage: `Hollis studies the water. "${staleOld}"`, role: 'forbidden' },
        { messageId: removedId, quote: 'The old shrine pays a silver for every wolf pelt.', indexedMessage: removedText, speaker: 'Tamsin', role: 'forbidden' },
        { messageId: fogId, quote: fogQuote, role: 'forbidden' },
        ...extra,
      ],
    },
    { id: 'a-withheld-quiet', kind: 'withheld', member: 'corvin', query: 'What exactly did Tamsin say about the lantern?', generationType: 'quiet', pool: [extra[1]] },
    { id: 'a-withheld-impersonate', kind: 'withheld', member: 'corvin', query: 'Quote Hollis on the mule.', generationType: 'impersonate', pool: [extra[2]] },
    { id: 'a-withheld-nocue', kind: 'withheld', member: 'hollis', query: 'Hollis, let us head down to the mill before the rain.', pool: [extra[0]] },
  ];
  return {
    id: 'session-a', chatId: 'chat-recall-a', storyId: 'recall-synthetic', storyHash: 'v2-recall-a', player: PLAYER, roster: ROSTER,
    messages: b.messages, reads: b.reads(),
    tellings: [
      { receiver: 'tamsin', telling: { messageId: tellingId, quote: tollTelling }, origin: { messageId: originId, quote: tollOrigin } },
      { receiver: 'tamsin', telling: { messageId: saltTellingId, quote: saltTelling }, origin: { messageId: saltOriginId, quote: saltOrigin } },
    ],
    epistemic: [
      { id: 'ep-a1', subject: 'Corvin', tag: 'hiding', content: 'Corvin is hiding that he sold the family map to the toll keeper', hiddenFrom: 'Tamsin', scene: 'camp' },
      { id: 'ep-a2', subject: 'Orrin', tag: 'hiding', content: 'poisoned Hollis', hiddenFrom: 'Tamsin, Hollis, Corvin', scene: 'cups' },
    ],
    cases,
  };
}

function sessionB() {
  const b = builder('chat-recall-b');
  const { publics, asides } = commonScenes(b, 12);
  const seal = 'That stamp on our papers? I pressed it myself with wax and a borrowed ring.';
  const sealId = b.say('tamsin', `Tamsin leans close to Corvin and murmurs, "${seal}"`, ['tamsin', 'corvin']);
  const garrison = 'I walked away from the border garrison the night before the muster.';
  const garrisonId = b.say('orrin', `Orrin leans close to Corvin and murmurs, "${garrison}"`, ['orrin', 'corvin']);
  const multiId = b.say('corvin', '"Hold the rope," Tamsin shouted. "I have it," Corvin answered.', ALL);
  const coins = 'We are short by three silver.';
  const coinsId = b.say('hollis', `Hollis counts the coins twice and frowns. "${coins}"`, ALL);
  const taggedId = b.say('orrin', '"Fine," Tamsin said, and Orrin only shrugged.', ALL);
  const eyesId = b.say('tamsin', '*Tamsin rolls her eyes* Nobody asked you, and nobody will.', ALL);
  const night = 'I never agreed to cross the river at night.';
  const nightId = b.say('player', `"${night}"`, ALL);
  const altered = publics[0];
  const alteredText = altered.quote.replace(/^The /, 'This ');
  if (alteredText === altered.quote) throw new Error('altered-quote bait must differ from its source span');
  const extra = publics.slice(1, 4).map((line) => ({ messageId: line.messageId, quote: line.quote, role: 'filler' }));
  const cases = [
    ...standardCases('b', publics, asides),
    { id: 'b-secret-01', kind: 'secret', member: 'hollis', query: 'Hollis, what exactly did Tamsin say about the papers?', pool: [{ messageId: sealId, quote: seal, role: 'secret' }, extra[0]] },
    { id: 'b-secret-02', kind: 'secret', member: 'hollis', query: 'What did Orrin say about the garrison? Word for word.', pool: [{ messageId: garrisonId, quote: garrison, role: 'secret' }, extra[1]] },
    { id: 'b-secret-03', kind: 'secret', member: 'tamsin', query: 'Quote Orrin on the border garrison.', pool: [{ messageId: garrisonId, quote: garrison, role: 'secret' }, extra[2]] },
    {
      id: 'b-vr8-01', kind: 'vr8', member: 'corvin', query: 'Corvin, what exactly was said at the river?',
      pool: [
        { messageId: multiId, quote: 'Hold the rope,', role: 'bait', trueSpeaker: 'Tamsin' },
        { messageId: multiId, quote: 'I have it,', role: 'bait', trueSpeaker: null },
        { messageId: coinsId, quote: 'Hollis counts the coins twice and frowns.', role: 'bait', trueSpeaker: null },
        { messageId: taggedId, quote: 'Fine,', role: 'bait', trueSpeaker: 'Tamsin' },
        { messageId: altered.messageId, quote: altered.quote, indexed: alteredText, role: 'bait' },
        { messageId: coinsId, quote: coins, role: 'filler' },
        { messageId: nightId, quote: night, role: 'filler' },
      ],
    },
    {
      id: 'b-vr8-02', kind: 'vr8', member: 'hollis', query: 'Hollis, what did Tamsin say, exactly?',
      pool: [
        { messageId: eyesId, quote: 'Tamsin rolls her eyes', role: 'bait', trueSpeaker: null },
        { messageId: eyesId, quote: 'Nobody asked you, and nobody will.', role: 'filler' },
        { messageId: taggedId, quote: '"Fine," Tamsin said', role: 'bait', trueSpeaker: null },
        extra[0],
      ],
    },
  ];
  return {
    id: 'session-b', chatId: 'chat-recall-b', storyId: 'recall-synthetic', storyHash: 'v2-recall-b', player: PLAYER, roster: ROSTER,
    messages: b.messages, reads: b.reads(), tellings: [],
    epistemic: [
      { id: 'ep-b1', subject: 'Hollis', tag: 'unaware', content: 'Hollis is unaware that Tamsin forged the reeve seal on the travel writ', scene: 'mill' },
      { id: 'ep-b2', subject: 'Orrin', tag: 'hiding', content: 'Orrin is hiding that he deserted the border garrison', hiddenFrom: 'Hollis, Tamsin', scene: 'garrison' },
    ],
    cases,
  };
}

writeFileSync(join(OUT, 'fixture.json'), `${JSON.stringify({
  format: 'so-recall-fixture/1',
  set: 'recall-synthetic',
  synthetic: true,
  pool: 'stub: the generator records each case pool in a fixed order (no embeddings); a tooling check, not R-Gate evidence',
  sessions: [sessionA(), sessionB()],
}, null, 1)}\n`);
