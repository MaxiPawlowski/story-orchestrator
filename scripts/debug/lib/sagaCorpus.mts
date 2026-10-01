export type SagaVariant = 'chaptered' | 'chapterless';

export interface SagaMessage {
  id: number;
  checkpoint: string;
  chapter: string;
  speaker: string;
  isUser: boolean;
  text: string;
  needle?: string;
}

export interface SagaTranscript {
  _note: string;
  story: string;
  variant: SagaVariant;
  generator: string;
  seed: number;
  messagesPerCheckpoint: number;
  messages: SagaMessage[];
  arrival: Omit<SagaMessage, 'id'>;
}

export interface SagaNeedle {
  id: string;
  chapter: string;
  checkpoint: string;
  messageId: number;
  entity: string;
  speaker: 'narrator' | 'player';
  statement: string;
  question: string;
  answer: string;
  accept: string;
  asked: boolean;
}

export interface SagaNeedles {
  _note: string;
  story: string;
  transcript: string;
  askAt: string;
  needles: SagaNeedle[];
}

export interface SagaStory {
  id?: string;
  title?: string;
  description?: string;
  chapters?: Array<{ id: string; kind?: string }>;
  checkpoints: Array<{ id: string; chapter?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export const SAGA_DIR = 'test/measurements/v2.6-07';
export const SAGA_SEED = 607;
export const NARRATOR = 'Narrator';
export const PLAYER = 'Player';
export const PLAYED_CHECKPOINTS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
export const ASK_AT = 'c11';
export const SLASH_UNSAFE = /["|={}]|^\s*\//;

export const VARIANTS: Record<SagaVariant, { perCheckpoint: number; story: string; transcript: string; needles: string }> = {
  chaptered: { perCheckpoint: 36, story: `${SAGA_DIR}/saga-mini.story.json`, transcript: `${SAGA_DIR}/saga-mini.transcript.json`, needles: `${SAGA_DIR}/needles.json` },
  chapterless: { perCheckpoint: 60, story: `${SAGA_DIR}/saga-mini-chapterless.story.json`, transcript: `${SAGA_DIR}/saga-mini-chapterless.transcript.json`, needles: `${SAGA_DIR}/saga-mini-chapterless.needles.json` },
};

type NeedleRow = [id: string, checkpoint: string, speaker: 'narrator' | 'player', entity: string, statement: string, question: string, answer: string, accept: string, asked: boolean];

export const NEEDLE_ROWS: NeedleRow[] = [
  ['N01', 'c1', 'narrator', 'caravan master', 'The caravan master greets you at the paddock gate and gives her name as Odalys Venn before moving on down the line.', 'What name did the caravan master give when she greeted us at the paddock gate?', 'Odalys', '\\bodalys\\b', true],
  ['N02', 'c1', 'narrator', 'lead camel', 'At the head of the line stands the lead camel, a scarred old bull the drovers call Brindlemoot.', 'What do the drovers call the lead camel?', 'Brindlemoot', '\\bbrindlemoot\\b', true],
  ['N03', 'c1', 'narrator', 'passage fee', 'Passage with the caravan costs eleven salt-coins, paid into a leather purse at the gate.', 'How many salt-coins did passage with the caravan cost?', 'eleven', '\\b(eleven|11)\\b', true],
  ['N04', 'c1', 'narrator', 'camp password', 'The night guard tells you the camp password is marrowfen, and warns you not to forget it.', 'What was the camp password the night guard gave us?', 'marrowfen', '\\bmarrowfen\\b', true],
  ['N05', 'c1', 'narrator', 'cook', 'The cook, a one-eyed man named Tobias Quell, ladles out lentils and grumbles about the heat.', 'What was the one-eyed cook\'s family name?', 'Quell', '\\bquell\\b', false],
  ['N06', 'c2', 'narrator', 'dune guide', 'The dune guide fingers his lucky charm, a small tortoise carved from green jade.', 'What animal was the dune guide\'s lucky charm carved as?', 'tortoise', '\\btortoises?\\b', true],
  ['N07', 'c2', 'narrator', 'sandstorm', 'The drovers name the coming sandstorm the Grey Widow and lash the loads down twice.', 'What name did the drovers give the sandstorm?', 'Grey Widow', 'gr[ae]y widow', true],
  ['N08', 'c2', 'narrator', 'stolen instrument', 'By morning the caravan\'s brass astrolabe is gone from the master\'s tent, stolen in the storm.', 'What instrument was stolen from the master\'s tent during the storm?', 'astrolabe', '\\bastrolabes?\\b', true],
  ['N09', 'c2', 'player', 'player wound', 'I stumble down the slip face and twist my left ankle badly, and I limp the rest of the day.', 'Which part of me did I hurt on the slip face?', 'ankle', '\\bankles?\\b', false],
  ['N10', 'c2', 'narrator', 'camp dune', 'You make camp in the lee of Saltjaw Dune, the tallest ridge for a day in any direction.', 'Under which dune did we make camp?', 'Saltjaw', '\\bsaltjaw\\b', true],
  ['N11', 'c3', 'narrator', 'well toll', 'The well-keeper will let you draw water only for a toll of a single blue feather.', 'What toll did the well-keeper demand before we could draw water?', 'feather', '\\bfeathers?\\b', true],
  ['N12', 'c3', 'narrator', 'well name', 'A worn plaque names the place the Well of Ashkari, after a queen nobody remembers.', 'What is the last well called?', 'Ashkari', '\\bashkari\\b', false],
  ['N13', 'c3', 'narrator', 'rival banner', 'A rival caravan arrives flying a banner of a red scorpion and camps across the oasis.', 'What creature was on the rival caravan\'s banner?', 'scorpion', '\\bscorpions?\\b', true],
  ['N14', 'c3', 'narrator', 'well inscription', 'Someone has scratched three words into the well stone: Mercy is salt.', 'What three words were scratched into the well stone?', 'Mercy is salt', 'mercy is salt', false],
  ['N15', 'c4', 'narrator', 'gate sergeant', 'The gate sergeant is a heavy man called Hollis Durrant, and he reads every paper twice.', 'What was the gate sergeant\'s family name?', 'Durrant', '\\bdurrant\\b', true],
  ['N16', 'c4', 'narrator', 'bribe', 'A flask of plum brandy changes hands, and the sergeant suddenly finds your papers in order.', 'What did we bribe the gate sergeant with?', 'plum brandy', '\\bplums?\\b', true],
  ['N17', 'c4', 'narrator', 'curfew bell', 'The city curfew bell rings at the hour of the owl, and after that the streets belong to the watch.', 'At what hour does the Harrowgate curfew bell ring?', 'owl', '\\bowls?\\b', true],
  ['N18', 'c4', 'player', 'forged papers', 'I hand over forged papers that name me Merrit Callow, a salt factor from the coast.', 'What false name did my forged papers give?', 'Callow', '\\bcallow\\b', false],
  ['N19', 'c5', 'narrator', 'quartermaster stall', 'The quartermaster hides in plain sight behind a stall selling lacquered birdcages.', 'What did the quartermaster\'s market stall sell?', 'birdcages', '\\bbird ?cages?\\b', true],
  ['N20', 'c5', 'narrator', 'quartermaster', 'He introduces himself, very quietly, as Fenwick Sorrel, late of the border garrison.', 'What was the quartermaster\'s family name?', 'Sorrel', '\\bsorrel\\b', true],
  ['N21', 'c5', 'narrator', 'map price', 'His maps of the river country cost forty crowns, and he will not haggle.', 'How many crowns did the quartermaster want for his maps?', 'forty', '\\b(forty|40)\\b', true],
  ['N22', 'c5', 'narrator', 'door mark', 'Friendly doors in Harrowgate, he says, carry a small chalk spiral beside the latch.', 'What chalk mark identifies friendly doors in Harrowgate?', 'spiral', '\\bspirals?\\b', true],
  ['N23', 'c5', 'narrator', 'pickpocket', 'A pickpocket girl named Pim lifts your purse and then, laughing, hands it back.', 'What was the pickpocket girl\'s name?', 'Pim', '\\bpim\\b', false],
  ['N24', 'c6', 'narrator', 'magistrate', 'The magistrate is a thin, patient woman named Ysolde Marrick who never raises her voice.', 'What was the magistrate\'s family name?', 'Marrick', '\\bmarrick\\b', true],
  ['N25', 'c6', 'narrator', 'charge', 'The charge read against you is smuggling indigo through the river gate.', 'What were we charged with smuggling?', 'indigo', '\\bindigo\\b', true],
  ['N26', 'c6', 'narrator', 'lying witness', 'The witness who lied about you turns out to be the tanner\'s son from Mill Lane.', 'Who was the witness that lied about us?', 'tanner', '\\btanner(\'?s)?\\b', false],
  ['N27', 'c6', 'narrator', 'oath', 'Your sentence is lifted in exchange for an oath sworn on a silver thimble.', 'What object was our oath sworn on?', 'thimble', '\\bthimbles?\\b', true],
  ['N28', 'c8', 'narrator', 'archive door', 'The archive door grinds open only when you speak the word Selvane into the keyhole.', 'What word opened the archive door?', 'Selvane', '\\bselvane\\b', true],
  ['N29', 'c8', 'narrator', 'lantern fuel', 'Your lanterns burn whale oil that smokes and stinks in the narrow stair.', 'What did our lanterns burn in the archive stair?', 'whale oil', '\\bwhale\\b', true],
  ['N30', 'c8', 'narrator', 'stair carvings', 'Carvings along the stair show a heron holding a key in its beak.', 'What bird is carved along the archive stair?', 'heron', '\\bherons?\\b', true],
  ['N31', 'c8', 'player', 'lost item', 'My brass compass slips from my belt and falls down the shaft, and I hear it hit water far below.', 'What did I lose down the shaft?', 'compass', '\\bcompass\\b', false],
  ['N32', 'c9', 'narrator', 'floodwater', 'The floodwater in the hall tastes of copper and stings the cuts on your hands.', 'What did the floodwater in the hall taste of?', 'copper', '\\bcopper\\b', true],
  ['N33', 'c9', 'narrator', 'drowned statue', 'A drowned statue rises from the water, and its plinth names it Queen Amarante.', 'Whose drowned statue stands in the flooded hall?', 'Amarante', '\\bamarante\\b', true],
  ['N34', 'c9', 'narrator', 'boat', 'You cross the hall in a reed coracle found tied to a pillar.', 'What kind of boat did we cross the flooded hall in?', 'coracle', '\\bcoracles?\\b', true],
  ['N35', 'c9', 'narrator', 'eels', 'Pale eels the old archivists called glasstongues circle beneath the surface.', 'What were the pale eels called?', 'glasstongues', '\\bglasstongues?\\b', false],
  ['N36', 'c9', 'narrator', 'recovered book', 'From a high shelf you recover the book you came for, the Ledger of Tides.', 'What book did we recover from the flooded hall?', 'Ledger of Tides', 'ledger of tides', true],
  ['N37', 'c10', 'narrator', 'keeper', 'The keeper of the archive gives his name as Absalom, and says he has waited a long time.', 'What name did the keeper of the archive give?', 'Absalom', '\\babsalom\\b', true],
  ['N38', 'c10', 'narrator', 'keeper price', 'His price for letting you leave is a lock of hair, cut with his own silver knife.', 'What price did the keeper ask for letting us leave?', 'lock of hair', '\\bhair\\b', true],
  ['N39', 'c10', 'narrator', 'keeper warning', 'He warns you never to sail under a red moon, or the archive will call you back.', 'What did the keeper warn us never to sail under?', 'red moon', 'red moon', false],
  ['N40', 'c10', 'narrator', 'tide day', 'The great tide, he says, will come at dawn of the seventh day.', 'On which day did the keeper say the great tide would come?', 'seventh', '\\bseventh\\b|\\b7(th)?\\b', true],
];

const SCENES: Record<string, string[]> = {
  c1: ['Camels groan as the drovers check the loads.', 'Dust hangs over the paddock in the late light.', 'A boy runs along the line with a water skin.', 'Bells clank on the harness of the pack animals.', 'Traders argue over the weight of the salt blocks.', 'The smell of dung and spice drifts over the yard.', 'Someone strikes up a tune on a reed pipe.', 'The sun drops behind the warehouse roofs.'],
  c2: ['The sand shifts under every step.', 'Wind combs the crests of the dunes into long streamers.', 'The heat presses down like a hand.', 'Tracks vanish behind the caravan within minutes.', 'The drovers sing to keep the animals moving.', 'A hawk circles high above the line.', 'Water is rationed by the cup.', 'The ridges roll on, gold and endless.'],
  c3: ['Palms lean over the green water of the oasis.', 'Women fill jars at the stone lip of the well.', 'Goats crowd the shade along the wall.', 'The water tastes sweet after days of dust.', 'Children chase lizards between the tents.', 'Smoke from cookfires drifts over the oasis.', 'Old ropes creak on the wooden winch.', 'Evening brings a cool breeze off the sand.'],
  c4: ['The gate towers loom over the road.', 'Carts queue in the mud outside the walls.', 'Guards in dark cloaks watch the queue.', 'A clerk scratches names into a register.', 'Rain begins to fall on the cobbles.', 'A beggar sings for coins by the arch.', 'Horses stamp and steam in the cold.', 'The portcullis rattles as it rises.'],
  c5: ['Stalls crowd the square under patched awnings.', 'Fishwives shout prices over the din.', 'The smell of bread and tar fills the lanes.', 'A juggler draws a crowd by the fountain.', 'Merchants weigh coins on brass scales.', 'Pigeons scatter from the gutters.', 'A cart of cabbages tips over in the lane.', 'Bells ring from the temple across the square.'],
  c6: ['The court room is cold and smells of wax.', 'Clerks shuffle papers at a long table.', 'Benches creak under the waiting crowd.', 'A dull light falls through high windows.', 'The bailiff calls for silence.', 'Quills scratch while the clerks take notes.', 'The crowd mutters at every pause.', 'A dog sleeps under the front bench.'],
  c7: ['The ferry rocks on the black river.', 'The ferryman poles in silence through the mist.', 'Lamps on the far bank glimmer and fade.', 'Water slaps against the hull.', 'Frogs call from the reeds along the shore.', 'The rope groans on its pulleys.', 'Cold mist beads on your cloak.', 'The town falls away behind you into the dark.'],
  c8: ['The stair winds down into the dark.', 'Water drips from the vaulted ceiling.', 'Your footsteps echo off the wet stone.', 'Moss grows thick on every step.', 'The air grows colder with every turn.', 'Old iron rings are set into the walls.', 'Somewhere below, water is moving.', 'Dust and damp mix into a sour smell.'],
  c9: ['Pillars march away into the flooded dark.', 'The water is still and black.', 'Ripples spread from every movement.', 'Drowned shelves lean under the surface.', 'Your breath fogs in the cold air.', 'Faint light filters from cracks above.', 'Something brushes past under the water.', 'Echoes carry strangely across the hall.'],
  c10: ['Candles burn in niches all around the chamber.', 'Books are stacked to the ceiling in crooked towers.', 'The keeper speaks in a voice as dry as paper.', 'Shadows sway as the candle flames move.', 'The chamber smells of old vellum.', 'A clock with no hands ticks on the wall.', 'Ink stains cover the long table.', 'Pages turn somewhere in the dark without a hand to turn them.'],
};

const GENERIC = ['Time passes slowly.', 'Nobody says much for a while.', 'You share a quiet meal.', 'The others rest while you keep watch.', 'A joke passes along the line and earns a tired laugh.', 'You check your gear again.', 'The day wears on.', 'Someone hums an old song.'];

const PLAYER_LINES = ['I keep close to the others and watch the road.', 'I ask how much farther we have to go.', 'I check my pack and tighten the straps.', 'I drink a little water and pass the skin along.', 'I keep my eyes open for trouble.', 'I nod and keep walking.', 'I help lift a heavy load.', 'I study the faces around me.', 'I rest for a moment and catch my breath.', 'I make a note of everything I see.', 'I stay quiet and listen.', 'I ask the others what they think of all this.', 'I offer to take the next watch.', 'I look back the way we came.', 'I keep one hand on my knife.'];

export const ARRIVAL_TEXT = 'At last the tunnel opens onto the shore, and you smell the sea. The boats wait on the sand, and the tide is turning.';

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const chapterOf = (story: SagaStory) => (checkpoint: string): string => story.checkpoints.find((entry) => entry.id === checkpoint)?.chapter ?? '';

export const CHAPTER_OF_CHECKPOINT: Record<string, string> = { c1: 'ch1', c2: 'ch1', c3: 'ch1', c4: 'ch2', c5: 'ch2', c6: 'ch2', c7: 'rest', c8: 'ch3', c9: 'ch3', c10: 'ch3', c11: 'ch4', c12: 'ch4', c13: 'ch4', c14: 'ch4' };

export function chapterlessStory(story: SagaStory): SagaStory {
  const { chapters: _chapters, ...rest } = story;
  return {
    ...rest,
    id: 'saga-mini-chapterless',
    title: 'Saga Mini (chapterless)',
    description: 'The Q-M8 corpus story: the saga-mini checkpoints with no chapters declared, for the era-seal arm. Generated from saga-mini.story.json by scripts/debug/lib/sagaCorpus.mts.',
    checkpoints: story.checkpoints.map(({ chapter: _chapter, ...checkpoint }) => checkpoint),
  };
}

const needleSlots = (count: number, perCheckpoint: number, speakers: Array<'narrator' | 'player'>) => {
  const step = Math.floor((perCheckpoint - 8) / count);
  return speakers.map((speaker, index) => {
    const base = 4 + index * step;
    const wantEven = speaker === 'narrator';
    return (base % 2 === 0) === wantEven ? base : base + 1;
  });
};

export function buildSagaCorpus(variant: SagaVariant): { transcript: SagaTranscript; needles: SagaNeedles } {
  const { perCheckpoint, story, transcript: transcriptPath } = VARIANTS[variant];
  const random = mulberry32(SAGA_SEED + (variant === 'chapterless' ? 1 : 0));
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
  const messages: SagaMessage[] = [];
  const needles: SagaNeedle[] = [];
  PLAYED_CHECKPOINTS.forEach((checkpoint, checkpointIndex) => {
    const rows = NEEDLE_ROWS.filter((row) => row[1] === checkpoint);
    const slots = needleSlots(Math.max(rows.length, 1), perCheckpoint, rows.map((row) => row[2]));
    for (let slot = 0; slot < perCheckpoint; slot += 1) {
      const id = checkpointIndex * perCheckpoint + slot;
      const narrator = slot % 2 === 0;
      const chapter = CHAPTER_OF_CHECKPOINT[checkpoint];
      const rowIndex = slots.indexOf(slot);
      const row = rowIndex >= 0 ? rows[rowIndex] : null;
      if (row) {
        const [needleId, , speaker, entity, statement, question, answer, accept, asked] = row;
        messages.push({ id, checkpoint, chapter, speaker: speaker === 'narrator' ? NARRATOR : PLAYER, isUser: speaker === 'player', text: statement, needle: needleId });
        needles.push({ id: needleId, chapter, checkpoint, messageId: id, entity, speaker, statement, question, answer, accept, asked });
        continue;
      }
      if (narrator) {
        const first = pick(SCENES[checkpoint]);
        let second = pick([...SCENES[checkpoint], ...GENERIC]);
        while (second === first) second = pick([...SCENES[checkpoint], ...GENERIC]);
        messages.push({ id, checkpoint, chapter, speaker: NARRATOR, isUser: false, text: `${first} ${second}` });
      } else {
        messages.push({ id, checkpoint, chapter, speaker: PLAYER, isUser: true, text: pick(PLAYER_LINES) });
      }
    }
  });
  const chapterNote = variant === 'chaptered'
    ? 'chapter is the story\'s chapter for the message\'s checkpoint.'
    : 'the story declares no chapters; chapter is the chaptered saga-mini chapter of the same checkpoint, kept so arms score per segment.';
  return {
    transcript: {
      _note: `v2.6 plan 07 Q-M corpus (${variant}): ${messages.length} scripted messages over ${PLAYED_CHECKPOINTS.join(', ')} (${perCheckpoint} per checkpoint), narrator on even slots, player on odd slots; replayed with /sendas (narrator) and /send (player), the transition into each checkpoint fires at its first narrator message. arrival is posted after the last message and carries the story into ${ASK_AT}, where the needle questions are asked. ${chapterNote} Generated by scripts/debug/lib/sagaCorpus.mts (seed ${SAGA_SEED}); do not edit by hand, regenerate with node scripts/debug/so-saga-recall.mts corpus.`,
      story,
      variant,
      generator: 'scripts/debug/lib/sagaCorpus.mts',
      seed: SAGA_SEED,
      messagesPerCheckpoint: perCheckpoint,
      messages,
      arrival: { checkpoint: ASK_AT, chapter: CHAPTER_OF_CHECKPOINT[ASK_AT], speaker: NARRATOR, isUser: false, text: ARRIVAL_TEXT },
    },
    needles: {
      _note: `40 needles, each stated exactly once in ${variant === 'chaptered' ? 'chapters ch1..ch3' : 'the ch1..ch3 checkpoints'} (shape of adolion lab/needles). accept is a case-insensitive regex; answer is the key form, which appears exactly once in the transcript. asked marks the 30 questions (10 per chapter) asked as the player at ${ASK_AT}; the other 10 are held back.`,
      story,
      transcript: transcriptPath,
      askAt: ASK_AT,
      needles,
    },
  };
}

const wordCount = (text: string, form: string) => {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'giu')) ?? []).length;
};

export const acceptRegex = (needle: Pick<SagaNeedle, 'accept'>) => new RegExp(needle.accept, 'i');

export function checkSagaCorpus(story: SagaStory, transcript: SagaTranscript, needles: SagaNeedles, variant: SagaVariant): string[] {
  const problems: string[] = [];
  const { perCheckpoint } = VARIANTS[variant];
  const declared = new Set((story.chapters ?? []).map((chapter) => chapter.id));
  const storyChapter = chapterOf(story);
  if (variant === 'chaptered' && !declared.size) problems.push('the chaptered story declares no chapters');
  if (variant === 'chapterless' && (declared.size || story.checkpoints.some((entry) => entry.chapter))) problems.push('the chapterless story still declares chapters');
  const ids = new Set(story.checkpoints.map((entry) => entry.id));
  for (const checkpoint of [...PLAYED_CHECKPOINTS, ASK_AT]) if (!ids.has(checkpoint)) problems.push(`checkpoint ${checkpoint} is not in the story`);
  const expectedCount = PLAYED_CHECKPOINTS.length * perCheckpoint;
  if (transcript.messages.length !== expectedCount) problems.push(`expected ${expectedCount} messages, got ${transcript.messages.length}`);
  transcript.messages.forEach((message, index) => {
    if (message.id !== index) problems.push(`message ${index} carries id ${message.id}`);
    const expectedCheckpoint = PLAYED_CHECKPOINTS[Math.floor(index / perCheckpoint)];
    if (message.checkpoint !== expectedCheckpoint) problems.push(`message ${index} is on ${message.checkpoint}, expected ${expectedCheckpoint}`);
    const chapter = variant === 'chaptered' ? storyChapter(message.checkpoint) : CHAPTER_OF_CHECKPOINT[message.checkpoint];
    if (message.chapter !== chapter) problems.push(`message ${index} says chapter ${message.chapter}, the story puts ${message.checkpoint} in ${chapter || '(none)'}`);
    if (SLASH_UNSAFE.test(message.text)) problems.push(`message ${index} carries a character the slash replay cannot post`);
    if (message.isUser !== (message.speaker === PLAYER)) problems.push(`message ${index}: speaker and isUser disagree`);
    if (index % 2 === 0 && message.isUser) problems.push(`message ${index}: an even slot must be the narrator`);
    if (index % perCheckpoint === 0 && message.isUser) problems.push(`message ${index}: a checkpoint must open on a narrator message (the transition boundary)`);
  });
  if (transcript.arrival.checkpoint !== ASK_AT || transcript.arrival.isUser) problems.push(`the arrival must be a narrator message on ${ASK_AT}`);
  const list = needles.needles;
  if (list.length !== 40 || new Set(list.map((needle) => needle.id)).size !== 40) problems.push(`expected 40 needles with distinct ids, got ${list.length}`);
  for (const chapter of ['ch1', 'ch2', 'ch3']) {
    const asked = list.filter((needle) => needle.chapter === chapter && needle.asked).length;
    if (asked !== 10) problems.push(`${chapter}: ${asked} asked needles, expected 10`);
  }
  const fillerTexts = transcript.messages.filter((message) => !message.needle).map((message) => message.text);
  const allTexts = [...transcript.messages.map((message) => message.text), transcript.arrival.text];
  for (const needle of list) {
    const regex = acceptRegex(needle);
    const message = transcript.messages[needle.messageId];
    if (!['ch1', 'ch2', 'ch3'].includes(needle.chapter)) problems.push(`${needle.id}: stated outside ch1..ch3 (${needle.chapter})`);
    if (!message || message.needle !== needle.id || message.text !== needle.statement) problems.push(`${needle.id}: message ${needle.messageId} does not carry its statement`);
    else {
      if (message.checkpoint !== needle.checkpoint) problems.push(`${needle.id}: checkpoint ${needle.checkpoint} differs from its message's ${message.checkpoint}`);
      if (message.chapter !== needle.chapter) problems.push(`${needle.id}: chapter ${needle.chapter} differs from its message's ${message.chapter}`);
      if (message.isUser !== (needle.speaker === 'player')) problems.push(`${needle.id}: speaker differs from its message`);
    }
    if (!regex.test(needle.statement)) problems.push(`${needle.id}: accept ${needle.accept} does not match its statement`);
    if (!regex.test(needle.answer)) problems.push(`${needle.id}: accept ${needle.accept} does not match its answer`);
    if (regex.test(needle.question)) problems.push(`${needle.id}: the question gives its own answer away`);
    const occurrences = allTexts.reduce((sum, text) => sum + wordCount(text, needle.answer), 0);
    if (occurrences !== 1) problems.push(`${needle.id}: key form "${needle.answer}" appears ${occurrences} times in the transcript, expected exactly once`);
    if (allTexts.filter((text) => regex.test(text)).length !== 1) problems.push(`${needle.id}: accept matches ${allTexts.filter((text) => regex.test(text)).length} messages, expected exactly its statement`);
    for (const filler of fillerTexts) if (regex.test(filler)) problems.push(`${needle.id}: filler message matches its accept: ${filler}`);
    for (const other of list) if (other !== needle && regex.test(other.statement)) problems.push(`${needle.id}: accept also matches ${other.id}'s statement`);
    for (const other of list) if (other !== needle && regex.test(other.question)) problems.push(`${needle.id}: accept matches ${other.id}'s question`);
  }
  return problems;
}

export const corpusJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
