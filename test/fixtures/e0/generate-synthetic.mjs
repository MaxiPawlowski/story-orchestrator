import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
const PLAYER = 'Wren';

const sessions = {
  'session-a': {
    facts: [
      ['Tobin', 'I swear the wagon axle will be mended before the frost moon, or you may keep my hammer.', 'Kestra', 'That axle has cracked twice since the ford.', 'What exactly did Tobin promise about the wagon axle?'],
      ['Kestra', 'Call the north road the Widow Path; nobody who walks it comes back the same.', 'Odo', 'The north road is quicker if the bridges hold.', 'What did Kestra call the north road?'],
      ['Sela', 'Bring me three sprigs of moonwort and I will brew a draught that stops the fever by dawn.', 'Tobin', 'Fever took half the drovers last winter.', 'What exactly did Sela say she would brew?'],
      ['Odo', 'Forty silver for the mule, and I throw in the saddlebags because I like your face.', 'Kestra', 'Never pay Odo his first price for anything.', 'What price did Odo name for the mule?'],
      ['Tobin', 'My father forged the bell at Harrowgate, and it still rings a half tone flat.', 'Sela', 'The Harrowgate bell woke me every morning as a girl.', 'What did Tobin say about the bell his father forged?'],
      ['Kestra', 'If the lantern goes out twice, we turn back. No arguments, no heroics.', 'Odo', 'Lantern oil costs more out here than wine.', 'What was Kestra\'s rule about the lantern going out?'],
      ['Sela', 'I owe the abbess at Corven a favour, and she will collect it at the worst possible moment.', 'Tobin', 'Corven abbey has the best cellars in the valley.', 'What did Sela say she owes the abbess?'],
      ['Odo', 'I never sell maps of the marsh. The last buyer drowned and his widow still writes to me.', 'Kestra', 'The marsh shifts every spring anyway.', 'Why did Odo say he never sells maps of the marsh?'],
      ['Tobin', 'Give me one quiet night and a hot forge and I will make you a blade that sings.', 'Sela', 'Nobody gets a quiet night on this road.', 'What did Tobin promise he could make with one quiet night?'],
      ['Kestra', 'The ferryman takes coin from the living and buttons from the dead. Keep a button handy.', 'Odo', 'I sold the ferryman a crate of nails once.', 'What did Kestra say the ferryman takes?'],
      ['Sela', 'Do not eat the blue mushrooms, whatever the cook says. They taste of copper and regret.', 'Tobin', 'The cook makes a decent stew when he is sober.', 'What did Sela warn about the blue mushrooms?'],
      ['Odo', 'My cousin Pell runs the toll at Brask; tell him the goose sent you and he waves you through.', 'Kestra', 'Brask tolls doubled after the flood.', 'What password did Odo give for the toll at Brask?'],
      ['Tobin', 'I named my anvil Grudge, because it has outlasted every one of mine.', 'Sela', 'Tobin talks to that anvil more than to people.', 'What did Tobin name his anvil and why?'],
      ['Kestra', 'Wolves in this valley hunt in threes. When you see one, look for the other two behind you.', 'Odo', 'A wolf pelt fetches good money in Brask.', 'What exactly did Kestra say about the wolves?'],
      ['Sela', 'I will stitch that wound once and only once. Tear it open again and you sew it yourself.', 'Tobin', 'That cut needs more than thread.', 'What did Sela say about stitching the wound?'],
      ['Odo', 'Half my profit goes to the orphan house in Lisle, and the other half goes to dice.', 'Kestra', 'Odo loses at dice more than he wins.', 'What did Odo say happens to his profit?'],
      ['Tobin', 'The river stones here are iron-red. Smelt enough of them and you could shoe a whole army.', 'Sela', 'The river runs red after the rains.', 'What did Tobin say about the river stones?'],
      ['Kestra', 'I keep my mother\'s compass. It points at whatever I miss most, never at north.', 'Odo', 'A good compass is worth a month of wages.', 'What did Kestra say her mother\'s compass points at?'],
      ['Sela', 'Swear on the salt that you will not leave anyone behind at the pass, Wren.', 'Tobin', 'The pass will be snowed in within a week.', 'What oath did Sela ask Wren to swear at the pass?'],
      ['Odo', 'I will buy the silver locket back from you for double, the day you decide to part with it.', 'Kestra', 'That locket has a crack along the hinge.', 'What exactly did Odo offer for the silver locket?'],
    ],
  },
  'session-b': {
    facts: [
      ['Lady Vey', 'The east wing stays locked. My husband\'s portraits do not care for visitors.', 'Brann', 'The east wing smells of damp and old varnish.', 'What did Lady Vey say about the east wing?'],
      ['Brann', 'I polish the silver every Tuesday, and every Tuesday one spoon is missing.', 'Ilse', 'The silver here is older than the house.', 'What did Brann say happens every Tuesday?'],
      ['Ilse', 'I will read the cards for you at midnight, but you must not laugh, or they turn sour.', 'Lady Vey', 'Card reading is a peasant habit.', 'What condition did Ilse set for reading the cards?'],
      ['Doctor Hale', 'The old lord died of a weak heart. I signed the paper myself and I stand by it.', 'Brann', 'The old lord climbed the tower stairs every night.', 'What did Doctor Hale say the old lord died of?'],
      ['Lady Vey', 'Call the gardener the Mole; he digs in places nobody asked him to dig.', 'Ilse', 'The gardener grows roses the colour of bruises.', 'What did Lady Vey call the gardener?'],
      ['Brann', 'If the bell in the pantry rings by itself, you leave the room and you do not look back.', 'Doctor Hale', 'Pantry bells ring when the wind is in the flue.', 'What exactly did Brann say to do when the pantry bell rings by itself?'],
      ['Ilse', 'My grandmother hid a letter behind the third stair, and I never had the courage to read it.', 'Brann', 'The stairs creak worst near the landing.', 'What did Ilse say her grandmother hid?'],
      ['Doctor Hale', 'I will give you something to sleep, but only two drops. Three and you will not wake for a day.', 'Lady Vey', 'The doctor drinks more than he prescribes.', 'How many drops did Doctor Hale say were safe?'],
      ['Lady Vey', 'I promise the inheritance goes to whoever finds the key, not to whoever shouts loudest.', 'Brann', 'The family lawyer has not visited in years.', 'What did Lady Vey promise about the inheritance?'],
      ['Brann', 'I served three masters in this house, and only the second one ever said thank you.', 'Ilse', 'Brann has been here longer than the furniture.', 'What did Brann say about the masters he served?'],
      ['Ilse', 'The cook puts rosemary in everything to hide the taste of the well water.', 'Doctor Hale', 'The well is deep and very cold.', 'Why did Ilse say the cook puts rosemary in everything?'],
      ['Doctor Hale', 'Burn my notebook if anything happens to me. Do not read it, just burn it.', 'Lady Vey', 'The doctor writes in a cramped little hand.', 'What did Doctor Hale ask be done with his notebook?'],
      ['Lady Vey', 'The chapel bell has been silent since the wedding, and I intend to keep it that way.', 'Brann', 'The chapel roof leaks over the altar.', 'What did Lady Vey say about the chapel bell?'],
      ['Brann', 'Call me when the candles gutter green. That means the cellar door is open again.', 'Ilse', 'The cellar holds nothing but apples and spiders.', 'What did Brann say green candle flames mean?'],
      ['Ilse', 'I swear I saw a child on the lawn at dawn, barefoot, holding a lantern without a flame.', 'Doctor Hale', 'Children from the village sometimes cut across the lawn.', 'What did Ilse swear she saw on the lawn?'],
      ['Doctor Hale', 'The scar on Lady Vey\'s wrist is older than her marriage. Ask her who gave it to her.', 'Brann', 'Lady Vey always wears long sleeves.', 'What did Doctor Hale say about the scar on Lady Vey\'s wrist?'],
      ['Lady Vey', 'You may borrow the grey mare, but if she comes back lame you will pay in blood or gold.', 'Ilse', 'The grey mare bites anyone who is not family.', 'What were Lady Vey\'s terms for borrowing the grey mare?'],
      ['Brann', 'The clock in the hall runs eleven minutes slow, and nobody is allowed to correct it.', 'Doctor Hale', 'That clock chimes at odd hours.', 'What did Brann say about the clock in the hall?'],
      ['Ilse', 'Wren, promise me you will open the music box only when I am in the room.', 'Lady Vey', 'The music box plays a tune nobody can name.', 'What did Ilse ask Wren to promise about the music box?'],
      ['Doctor Hale', 'The gardener paid me in seeds once. They grew into something with teeth.', 'Brann', 'The doctor owes half the village money.', 'What did Doctor Hale say grew from the gardener\'s seeds?'],
    ],
  },
};

const REPLIES = ['Give me a moment to remember.', 'I think I can recall that.', 'Let me think back on it.', 'That was a while ago now.', 'Ask me again later if I get it wrong.'];
const FILLER = ['The fire crackles while everyone settles in.', 'Rain drums on the roof for a while.', 'Someone hums an old tune under their breath.', 'A door creaks somewhere down the hall.'];

mkdirSync(out, { recursive: true });
const labels = { format: 'so-e0-labels/1', source: 'synthetic', questions: [] };
for (const [session, { facts }] of Object.entries(sessions)) {
  const rows = new Array(40);
  facts.forEach((fact, index) => {
    rows[2 * index] = { name: fact[0], isUser: false, text: fact[1] };
    rows[2 * ((index + 7) % 20) + 1] = { name: fact[2], isUser: false, text: fact[3] };
  });
  const goldOf = new Map(facts.map((_, index) => [index, 2 * index]));
  const order = [18, 19, ...Array.from({ length: 18 }, (_, index) => (index * 7) % 18)];
  if (new Set(order).size !== 20) throw new Error('order is not a permutation');
  order.forEach((factIndex, k) => {
    rows.push({ name: PLAYER, isUser: true, text: facts[factIndex][4] });
    rows.push({ name: facts[(factIndex + 3) % 20][0], isUser: false, text: k % 6 === 5 ? FILLER[k % FILLER.length] : REPLIES[k % REPLIES.length] });
    labels.questions.push({ id: `${session}-q${String(k + 1).padStart(2, '0')}`, session, askMessageId: 40 + 2 * k, asker: PLAYER, text: facts[factIndex][4], gold: [goldOf.get(factIndex)], review: null });
  });
  const chat = rows.map((row, id) => ({ id, ...row }));
  mkdirSync(join(out, session), { recursive: true });
  writeFileSync(join(out, session, `chat-${session}.json`), `${JSON.stringify(chat, null, 1)}\n`);
}
writeFileSync(join(out, 'labels.json'), `${JSON.stringify(labels, null, 1)}\n`);
console.log(labels.questions.length);
