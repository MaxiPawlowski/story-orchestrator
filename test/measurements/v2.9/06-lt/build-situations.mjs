// Builds situations.json (the frozen 06 LT corpus draft). Run: node build-situations.mjs
// Seed op vocabulary (gen.mjs turns each into scenario steps):
//   say     {say: "DM Narrator"|"Arin", text}         /sendas, commits a boundary
//   set     {set: [key, value]}                         /cp set, commits a boundary (transitions fire here)
//   player  {player: text}                              send (posts the player line, no generation, no boundary)
//   promise {promise: {to, quote}}                      seeded read: [promised] line over the LAST player message
//   arcOpen {arcOpen: text}  arcResolve {arcResolve: text}   applyExtractionAudit arc signals
//   hiding  {hiding: {subject, from, content}}           seeded read: [hiding] epistemic row (held secret)
//   stuck   {stuck: text}                                the final player line (send), the stuck moment
import { writeFileSync } from "node:fs";

const eq = (q, v = true) => ({ q, op: "==", v });
const all = (...gates) => ({ all: gates });
const B = (key, rubric, extra = {}) => ({ key, type: "bool", source: "extractor", rubric, ...extra });
const C = (key, rubric) => ({ key, type: "bool", source: "code", rubric });
const item = (label) => ({ display: { public: true, label, as: "item" } });
const roster = (role) => [{ id: "arin", name: "Arin", role }, { id: "narrator", name: "DM Narrator", role: "narrator" }];
const cp = (id, player_name, objective, extra = {}) => ({ id, name: player_name.replace(/^The /, ""), player_name, objective, type: "anchor", ...extra });
const go = (from, to, gate, extra = {}) => ({ from, to, priority: 0, gate, ...extra });
const checkT = (from, to, tried, ok, check) => go(from, to, all(eq(tried), eq(ok)), { check: { quality: ok, narrate: "public", ...check } });
const step = (text, done, extra = {}) => ({ text, done_when: eq(done), ...extra });
const quest = (id, title, visible, steps, extra = {}) => ({ id, title, kind: "side", ...(visible ? { visible_when: eq(visible) } : {}), done_when: eq(`${id}_done`), steps, ...extra });

const curly = (text) => text.replace(/"([^"]*)"/g, "“$1”");
const N = (text) => ({ say: "DM Narrator", text: curly(text) });
const A = (text) => ({ say: "Arin", text: curly(text) });
const P = (text) => ({ player: text });
const SET = (key, value = true) => ({ set: [key, value] });
const ARC = (text) => ({ arcOpen: text });
const RES = (text) => ({ arcResolve: text });
const PROM = (quote, to = "Arin") => ({ promise: { to, quote } });
const HIDE = (content) => ({ hiding: { subject: "Arin", from: "DM Narrator", content } });
const STUCK = (text) => ({ stuck: text });

const story = (n, o) => {
  const qualityKeys = new Set((o.qualities ?? []).map((q) => q.key));
  const questDone = (o.quests ?? []).map((q) => `${q.id}_done`).filter((k) => !qualityKeys.has(k)).map((k) => B(k, `Is the ${k.replace(/_done$/, "").replace(/_/g, " ")} task finished?`));
  return {
    id: `so-v29-06-lt-s${n}`,
    title: `SO-V29-06 LT s${n}`,
    description: `v2.9 06 LT synthetic stuck-player situation s${n}: ${o.premise}`,
    ...(o.player_intro ? { player_intro: o.player_intro } : {}),
    qualities: [...(o.qualities ?? []), ...questDone],
    checkpoints: o.checkpoints,
    transitions: o.transitions ?? [],
    ...(o.quests ? { quests: o.quests } : {}),
    ...(o.codex ? { codex: o.codex } : {}),
    roster: roster(o.role ?? "a travelling companion"),
    requirements: { members: ["Arin", "DM Narrator"] },
  };
};

const S = [];
const add = (n, mix, o) => S.push({
  id: `s${n}`, mix, premise: o.premise, story: story(n, o), seed: o.seed,
  expect: { kinds: o.kinds ?? [], absent: o.absent ?? [], help: o.help ?? [], greyed: o.greyed ?? [], authoredOffers: o.offers ?? [] },
  ...(o.note ? { note: o.note } : {}),
  ...(o.bait ? { bait: o.bait, leakNeedles: o.needles, ...(o.baitInState ? { baitInState: true } : {}) } : {}),
});

// ---------------- quest (s01-s06) ----------------
add("01", "quest", {
  premise: "A lighthouse keeper asked for help relighting the lamp.",
  qualities: [B("accepted_lamp", "Did the player agree to help the lighthouse keeper?"), B("found_oil", "Has the player found lamp oil?"), B("lamp_lit", "Is the lighthouse lamp lit?")],
  checkpoints: [cp("rocks", "The Lighthouse Rocks", "Relight the lamp.", { start: true, player_text: "Help the keeper relight the lighthouse lamp before the fishing boats return." })],
  quests: [quest("lamp", "The keeper's lamp", "accepted_lamp", [step("Find oil for the lamp", "found_oil"), step("Carry the oil up the tower", "lamp_lit")], { giver: "narrator" })],
  seed: [N("Waves break on the rocks below a dark lighthouse. An old keeper waves you over."), A("Arin squints up at the tower. \"No light at all. The boats will wreck.\""), SET("accepted_lamp"),
    N("The keeper presses an empty oil can into your hands and points vaguely toward the village."), STUCK("I turn the empty can over in my hands. I really don't know where to start.")],
  kinds: ["objective", "quest-step"],
});
add("02", "quest", {
  premise: "Harvest helpers look for a missing cider press; a hidden step names who took it.",
  qualities: [B("joined_harvest", "Did the player join the orchard harvest?"), B("miller_exposed", "Has it been shown that the miller sold the press?"), B("asked_pickers", "Has the player asked the pickers about the press?")],
  checkpoints: [cp("orchard", "The Orchard", "Find the press.", { start: true, player_text: "Help the orchard find its missing cider press." })],
  quests: [quest("press", "The missing cider press", "joined_harvest", [
    step("Prove the miller sold the press to the river barge", "miller_exposed", { visible_when: eq("miller_exposed") }),
    step("Ask the pickers who used the press last", "asked_pickers")])],
  seed: [N("Rows of apple trees sag with fruit. The pressing shed stands open and empty."), A("Arin kicks at the bare floor where the press used to sit. \"Someone carted it off.\""), SET("joined_harvest"),
    N("The pickers keep working, glancing at you now and then."), STUCK("This is a mess. What am I even supposed to do about a missing press?")],
  kinds: ["objective", "quest-step"],
  bait: "hidden prerequisite: the first quest step (who took the press) is not visible yet; only the pickers step may anchor",
  needles: ["miller sold", "sold the press", "river barge"],
});
add("03", "quest", {
  premise: "An archive clerk's torn ledger; the only quest step names an unreached vault.",
  qualities: [B("took_ledger_job", "Did the player take the clerk's ledger job?"), B("vault_key", "Does the player hold the vault key?"), B("in_vault", "Has the party entered the sealed vault?")],
  checkpoints: [cp("reading_room", "The Reading Room", "Mend the ledger.", { start: true, player_text: "Work out who tore the page from the archive ledger." }), cp("vault", "The Sealed Vault", "Search the vault.")],
  transitions: [go("reading_room", "vault", eq("in_vault"))],
  quests: [quest("ledger", "The torn ledger", "took_ledger_job", [step("Find the key to the Sealed Vault", "vault_key")])],
  seed: [N("Dust hangs in the lamplight of the archive reading room. A clerk frets over a ledger with a page torn out."), SET("took_ledger_job"),
    A("Arin runs a finger along the ragged edge of the missing page. \"Clean tear. Someone did this on purpose.\""), ARC("Someone tore a page out of the archive ledger and nobody knows who."),
    N("The clerk wrings his hands and says nothing more."), STUCK("Okay... I've got nothing. Where do I even go from here?")],
  kinds: ["objective", "thread"], absent: ["quest-step:ledger.0"],
  bait: "hidden prerequisite: the only open step names an unreached checkpoint, so the step must be screened out",
  needles: ["Sealed Vault", "vault key"],
});
add("04", "quest", {
  premise: "A smith needs charcoal for a tourney blade; a hidden quest says the smith forges guild seals.",
  qualities: [B("agreed_blade", "Did the player agree to help the smith?"), B("has_charcoal", "Has the player brought good charcoal?"), B("saw_stamping", "Has the player seen the smith stamping seals?")],
  checkpoints: [cp("forge", "The Smithy", "Help the smith.", { start: true, player_text: "Help the smith finish a blade in time for the tourney." })],
  quests: [quest("blade", "A blade for the tourney", "agreed_blade", [step("Bring the smith good charcoal", "has_charcoal")]),
    quest("seal", "The smith's forged seals", "saw_stamping", [step("Catch the smith stamping counterfeit guild seals", "saw_stamping")])],
  seed: [N("The smithy roars with heat. The smith hammers a half-finished blade and curses the poor coals."), SET("agreed_blade"), A("Arin fans the smoke away. \"Those coals are mostly dirt.\""),
    N("The smith goes back to hammering, muttering about the tourney."), STUCK("Right. So... what now?")],
  kinds: ["objective", "quest-step"], absent: ["quest-step:seal.0"],
  bait: "hidden quest: its title and step reveal a secret about the smith",
  needles: ["counterfeit", "guild seal", "forged seal"],
});
add("05", "quest", {
  premise: "Earning passage downriver; an offered-but-not-accepted quest about a drowned bell.",
  qualities: [B("asked_fare", "Has the player asked about the ferry fare?"), B("nets_mended", "Has the player mended the ferryman's nets?"), B("heard_bell", "Has the player heard the bell rumour?"), B("took_bell_job", "Has the player accepted the bell job?"), B("bell_raised", "Has the bell been raised?")],
  checkpoints: [cp("landing", "The Ferry Landing", "Get passage.", { start: true, player_text: "Earn passage on the ferry downriver." })],
  quests: [quest("passage", "Passage downriver", "asked_fare", [step("Earn the fare by mending the ferryman's nets", "nets_mended")]),
    quest("bell", "The drowned bell", "took_bell_job", [step("Dive for the bell under the old pier", "bell_raised")], { offered_when: eq("heard_bell") })],
  seed: [N("A flat ferry bumps against the landing. The ferryman counts coins and shakes his head at you."), SET("asked_fare"), SET("heard_bell"),
    A("Arin pats her empty purse. \"We can't pay what he's asking.\""), N("Torn nets lie in a heap beside the ferryman's hut."), STUCK("I have no idea how we're getting on that boat.")],
  kinds: ["objective", "quest-step"], absent: ["quest:bell", "quest-step:bell.0"],
  bait: "offered (not accepted) quest: its title is withheld and must not anchor",
  needles: ["drowned bell", "old pier"],
});
add("06", "quest", {
  premise: "Crossing a mountain pass; a hidden latch says the guide will abandon the party.",
  qualities: [B("planning_pass", "Is the party planning to cross the pass?"), B("hired_guide", "Has the party hired a guide?"), B("at_ridge", "Has the party reached the ridge?"), C("guide_abandons", "The hired guide will abandon the party at the ridge.")],
  checkpoints: [cp("village", "The Last Village", "Prepare.", { start: true, player_text: "Prepare to cross the mountain pass before winter." }), cp("ridge", "The Empty Ridge", "Survive the ridge.")],
  transitions: [go("village", "ridge", eq("at_ridge"))],
  quests: [quest("pass", "Over the pass", "planning_pass", [step("Hire a guide in the village", "hired_guide"), step("Reach the ridge before nightfall", "at_ridge")])],
  seed: [N("Snow-capped peaks loom over a cluster of stone houses at the end of the road."), SET("planning_pass"), SET("guide_abandons"),
    A("Arin pulls her cloak tight. \"We won't make it over without someone who knows the way.\""), N("Villagers hurry indoors as the wind picks up."), STUCK("I'm kind of stuck. What should I do?")],
  kinds: ["objective", "quest-step"],
  bait: "predetermined outcome: a hidden code latch says the guide will abandon the party; an unreached checkpoint names the ridge",
  needles: ["abandon", "Empty Ridge", "betray"],
});

// ---------------- dormant-arc (s07-s12) ----------------
const twoRooms = (a, b, gateKey, texts = {}) => ({
  checkpoints: [cp(a[0], a[1], a[2], { start: true, ...(texts.a ? { player_text: texts.a } : {}) }), cp(b[0], b[1], b[2], texts.b ? { player_text: texts.b } : {})],
  transitions: [go(a[0], b[0], eq(gateKey))],
});
add("07", "dormant-arc", {
  premise: "A carnival; an old request from the fortune teller sits under a new commotion.",
  qualities: [B("entered_midway", "Has the party entered the midway?")],
  ...twoRooms(["gates", "The Carnival Gates", "Enter."], ["midway", "The Midway", "Explore."], "entered_midway", { b: "Enjoy the carnival without losing your purse." }),
  seed: [N("Music and lantern light spill from the carnival gates."), ARC("The fortune teller asked you to bring back her lost tarot deck."), A("Arin grins. \"Did she just hire us?\""), N("A crowd sweeps you toward the gates."),
    SET("entered_midway"), N("The midway is loud with barkers and the smell of fried dough."), ARC("A child is crying alone near the carousel."), A("Arin points. \"That kid looks lost.\""), STUCK("So much going on. I don't know what to do first.")],
  kinds: ["objective", "thread", "dormant-thread"],
});
add("08", "dormant-arc", {
  premise: "A monastery; a closed subplot resurfaces an older open thread.",
  qualities: [B("in_library", "Has the party entered the monastery library?")],
  ...twoRooms(["courtyard", "The Courtyard", "Arrive."], ["library", "The Library", "Read."], "in_library", { b: "Find the record of the founding." }),
  seed: [N("Bells ring over a quiet monastery courtyard."), ARC("Brother Anselm still owes you an answer about the bell tower key."), ARC("The courtyard well has run completely dry."), A("Arin peers into the well. \"Bone dry.\""), N("Monks pass in silence."),
    SET("in_library"), N("Shelves of old books climb to the ceiling of the library."), ARC("The librarian is searching for a misplaced psalter."), RES("The courtyard well has been refilled with water."),
    STUCK("Hmm. I'm not sure what to look at.")],
  kinds: ["objective", "thread", "dormant-thread"], note: "an arc resolved within 4 boundaries: dormant thread gets the +1.5 resurfacing bonus (weight 2.5)",
});
add("09", "dormant-arc", {
  premise: "A space station; an older errand and a flickering hydroponics bay, no objective text.",
  qualities: [B("in_hydro", "Has the party entered hydroponics?")],
  ...twoRooms(["ring", "The Docking Ring", "Dock."], ["hydro", "Hydroponics", "Look around."], "in_hydro"),
  player_intro: "You are a contract engineer just docked at a run-down orbital station.",
  seed: [N("The docking ring hums. A tired quartermaster scrolls through an inventory pad."), ARC("The quartermaster wants the missing coolant canister found."), A("Arin reads over his shoulder. \"Coolant missing, again.\""), N("Alarms chirp somewhere far off."),
    SET("in_hydro"), N("Rows of plants glow under unsteady grow lamps."), ARC("The hydroponics grow lights keep flickering on and off."), STUCK("What should I do now?")],
  kinds: ["thread", "dormant-thread"],
});
add("10", "dormant-arc", {
  premise: "An inn; Arin holds a secret that an old arc restates.",
  qualities: [B("in_stables", "Has the party gone out to the stables?")],
  ...twoRooms(["common", "The Common Room", "Rest."], ["stables", "The Stables", "Tend the horses."], "in_stables", { b: "Get the horses ready to leave by morning." }),
  seed: [N("A fire crackles in the inn's common room."), ARC("The innkeeper asked you to find his runaway cat."), HIDE("Arin hid the stolen ruby inside the saddlebag of the grey mare."),
    ARC("Arin hid the stolen ruby inside the grey mare's saddlebag."), A("Arin stretches and yawns. \"Long day.\""), N("The innkeeper wipes down the tables."),
    SET("in_stables"), N("Horses shift and snort in the dim stable."), ARC("The stable boy wants help calming a frightened horse."), STUCK("I'm out of ideas. What now?")],
  kinds: ["objective", "thread", "dormant-thread"], absent: ["dormant-thread restating the ruby secret"],
  bait: "held secret: an open arc restates Arin's [hiding] row; the resting filter must drop it from threads and anchors",
  needles: ["ruby", "stolen ruby"],
});
add("11", "dormant-arc", {
  premise: "A harbour; a hidden latch says the customs officer is an impostor.",
  qualities: [B("in_customs", "Has the party entered the customs house?"), C("officer_impostor", "The customs officer is an impostor wearing a stolen uniform."), B("in_cove", "Has the party reached the cove?")],
  checkpoints: [cp("market", "The Fish Market", "Shop.", { start: true }), cp("customs", "The Customs House", "Clear customs.", { player_text: "Get your papers stamped so you can sail tomorrow." }), cp("cove", "The Smugglers' Cove", "Hide.")],
  transitions: [go("market", "customs", eq("in_customs")), go("customs", "cove", eq("in_cove"))],
  seed: [N("Gulls scream over the fish market."), ARC("The net-mender lost a silver hook somewhere in the market."), A("Arin sniffs. \"Smells like yesterday's catch.\""), N("Carts rattle past."),
    SET("in_customs"), SET("officer_impostor"), N("A customs officer questions every sailor in the queue."), ARC("The customs officer is questioning every sailor at length."), STUCK("Ugh. I don't know what to do.")],
  kinds: ["objective", "thread", "dormant-thread"],
  bait: "predetermined outcome: a hidden code latch (officer is an impostor) and an unreached checkpoint name",
  needles: ["impostor", "stolen uniform", "Smugglers' Cove"],
});
add("12", "dormant-arc", {
  premise: "A village fair; a held secret arc and a resurfacing old thread.",
  qualities: [B("at_mill", "Has the party gone to the mill?")],
  ...twoRooms(["green", "The Village Green", "Enjoy the fair."], ["mill", "The Mill", "Visit the miller."], "at_mill", { a: "Enjoy the fair." }),
  seed: [N("Bunting flutters over the village green."), ARC("The miller's daughter asked you to find her lost blue ribbon."), HIDE("Arin poisoned the prize pie so the baker would lose the contest."),
    ARC("Arin poisoned the baker's prize pie so the baker would lose the contest."), ARC("The judges' table collapsed in the middle of the contest."), A("Arin hums and looks away."),
    SET("at_mill"), N("The mill stands silent beside the stream."), ARC("The great mill wheel has stopped turning."), RES("The judges' table was repaired and the contest went on."), STUCK("Now what? I'm stuck.")],
  kinds: ["thread", "dormant-thread"],
  bait: "held secret arc (dropped) next to a clean dormant arc with the resurfacing bonus",
  needles: ["poison", "prize pie"],
});

// ---------------- promise (s13-s18) ----------------
add("13", "promise", {
  premise: "At a rope bridge the player promised to carry Arin's pack.",
  qualities: [B("across", "Has the party crossed the gorge?")],
  checkpoints: [cp("bridge", "The Rope Bridge", "Cross.", { start: true, player_text: "Get everyone across the gorge." }), cp("far_side", "The Far Side", "Rest.")],
  transitions: [go("bridge", "far_side", eq("across"))],
  seed: [N("A rope bridge sways over a deep gorge."), A("Arin winces and rubs her twisted ankle. \"I can barely walk, let alone carry all this.\""),
    P("Arin, I promise I will carry your pack across the bridge."), PROM("I promise I will carry your pack across the bridge"), N("The wind picks up and the bridge creaks."), STUCK("Okay. Now I'm frozen. What do I do?")],
  kinds: ["objective", "promise"],
});
add("14", "promise", {
  premise: "At a bakery the player swore to repay a loan.",
  qualities: [B("repaid", "Has the player repaid Arin?")],
  checkpoints: [cp("bakery", "The Bakery", "Work.", { start: true })],
  seed: [N("Warm bread scents the little bakery where you have been sleeping in the back room."), A("Arin counts the coins she lent you. \"That was most of my savings.\""),
    P("Arin, I swear I'll repay the loan before the harvest festival."), PROM("I swear I'll repay the loan before the harvest festival"), N("Customers come and go."), A("Arin goes back to kneading dough."), STUCK("I'm not sure what to do with myself.")],
  kinds: ["promise"],
});
add("15", "promise", {
  premise: "A watchtower; the player gave their word to light the signal fire.",
  qualities: [B("fire_lit", "Is the signal fire lit?")],
  checkpoints: [cp("tower", "The Watchtower", "Keep watch.", { start: true, player_text: "Keep watch over the valley through the night." })],
  seed: [N("From the watchtower you can see the whole valley under a red sky."), A("Arin hands you the flint. \"If raiders come, the village needs the signal.\""),
    P("You have my word, Arin. I give you my word I will light the signal fire at dusk."), PROM("I give you my word I will light the signal fire at dusk"), N("The sun sinks lower."), STUCK("What should I be doing right now?")],
  kinds: ["objective", "promise"],
});
add("16", "promise", {
  premise: "A library; a promise to find a lost first volume plus a current thread.",
  qualities: [B("found_volume", "Has the first volume been found?")],
  checkpoints: [cp("stacks", "The Stacks", "Search.", { start: true, player_text: "Help Arin finish her research before the library closes." })],
  seed: [N("Tall shelves fill the old library."), A("Arin slams a book shut. \"The first volume is missing. Without it the rest is useless.\""),
    P("Arin, I promise I will find the lost first volume for you."), PROM("I promise I will find the lost first volume for you"), ARC("A bell will soon ring to close the library for the night."), N("A librarian glances at the clock."),
    STUCK("Where would I even look? I'm stuck.")],
  kinds: ["objective", "promise", "thread"],
});
add("17", "promise", {
  premise: "A tavern; only a conditional promise exists, so no promise anchor.",
  qualities: [B("has_horse", "Does the player have Arin's horse?")],
  checkpoints: [cp("tavern", "The Crossroads Tavern", "Plan.", { start: true, player_text: "Find a way to reach the city before the gates close." })],
  seed: [N("Rain drums on the roof of the crossroads tavern."), A("Arin sips her ale. \"My horse is in the yard, but I'm not handing it to just anyone.\""),
    P("Arin, if you lend me your horse, I promise I will return it by morning."), PROM("I promise I will return it by morning"), A("Arin raises an eyebrow and says nothing."), STUCK("I don't know what to try next.")],
  kinds: ["objective"], absent: ["promise (conditional rows are excluded)"],
});
add("18", "promise", {
  premise: "A walled garden; a promise to weed the beds, plus a hidden offer about a strongbox.",
  qualities: [B("weeded", "Are the herb beds weeded?"), B("found_strongbox_clue", "Has the player learned about the strongbox?")],
  checkpoints: [cp("garden", "The Walled Garden", "Tend.", { start: true, player_text: "Look after the herb garden while its owner is away.",
    offers: [{ id: "dig", text: "I dig up the buried strongbox under the sundial.", visible_when: eq("found_strongbox_clue") }] })],
  seed: [N("Herbs grow wild inside a walled garden."), A("Arin frowns at the weeds. \"The owner will be furious if the beds look like this.\""),
    P("I promise I'll weed the herb beds for you before the frost, Arin."), PROM("I promise I'll weed the herb beds for you before the frost"), N("A cold breeze rustles the leaves."), STUCK("I'm lost. What now?")],
  kinds: ["objective", "promise"], absent: ["offer:dig"],
  bait: "hidden offer: visible_when false, its text names a buried strongbox",
  needles: ["strongbox", "sundial"],
});

// ---------------- public-check-hint (s19-s24) ----------------
add("19", "public-check-hint", {
  premise: "A cliff climb with two disclosed helps.",
  qualities: [B("tried_climb", "Did the player try to climb the cliff?"), C("climb_ok", "Set by the climb check"), B("has_rope", "Does the player hold a rope?"), B("has_chalk", "Does the player have climbing chalk?")],
  checkpoints: [cp("beach", "The Cliff Beach", "Climb.", { start: true, player_text: "Get up the cliff before the tide comes in." }), cp("clifftop", "The Clifftop", "Look around.")],
  transitions: [checkT("beach", "clifftop", "tried_climb", "climb_ok", { id: "climb", label: "Climb the cliff", roll: { sides: 20, target: 13 },
    modifiers: [{ q: "has_rope", v: true, add: 4, hint: "a rope" }, { q: "has_chalk", v: true, add: 2, hint: "chalk for your hands" }] })],
  seed: [N("A sheer cliff rises from a narrow beach. The tide is creeping in."), A("Arin looks up. \"That's a long way.\""), N("Waves lap closer to your boots."), STUCK("I don't know how to get up there.")],
  kinds: ["objective", "check-help"], help: ["Climb the cliff — could help: a rope, chalk for your hands"],
});
add("20", "public-check-hint", {
  premise: "Persuading a gatekeeper; one help is a public item the player holds.",
  qualities: [B("tried_persuade", "Did the player try to persuade the gatekeeper?"), C("persuade_ok", "Set by the persuade check"), B("has_letter", "Does the player hold a letter of introduction?", item("Letter of introduction")), B("has_mayor_seal", "Does the player carry the mayor's seal?")],
  checkpoints: [cp("gate", "The City Gate", "Enter.", { start: true, player_text: "Get through the city gate before nightfall." }), cp("city", "The City", "Explore.")],
  transitions: [checkT("gate", "city", "tried_persuade", "persuade_ok", { id: "persuade", label: "Persuade the gatekeeper", roll: { sides: 20, target: 14 },
    modifiers: [{ q: "has_letter", v: true, add: 3, hint: "a letter of introduction" }, { q: "has_mayor_seal", v: true, add: 5, hint: "the mayor's seal" }] })],
  seed: [N("A stern gatekeeper blocks the city gate with a halberd."), SET("has_letter"), N("You feel the folded letter of introduction in your coat."), A("Arin whispers, \"He doesn't look friendly.\""), STUCK("How do I get past this guy?")],
  kinds: ["objective", "check-help"], help: ["Persuade the gatekeeper — could help: a letter of introduction (you have it), the mayor's seal"],
});
add("21", "public-check-hint", {
  premise: "Two checks: a swim with a disclosed help, and a lock whose help is not disclosed yet.",
  qualities: [B("tried_swim", "Did the player try to swim the channel?"), C("swim_ok", "Set by the swim check"), B("has_float", "Does the player have a cork float?"),
    B("tried_lock", "Did the player try to pick the lock?"), C("lock_ok", "Set by the lock check"), B("has_spare_key", "Does the player hold the spare key?"), B("saw_boathouse", "Has the player seen the boathouse?")],
  checkpoints: [cp("shore", "The Channel Shore", "Cross.", { start: true, player_text: "Find a way across the cold channel." }), cp("island", "The Island", "Explore.")],
  transitions: [checkT("shore", "island", "tried_swim", "swim_ok", { id: "swim", label: "Swim the channel", roll: { sides: 20, target: 12 }, modifiers: [{ q: "has_float", v: true, add: 3, hint: "a cork float" }] }),
    checkT("shore", "island", "tried_lock", "lock_ok", { id: "lock", label: "Pick the boathouse lock", roll: { sides: 20, target: 15 }, hint_when: eq("saw_boathouse"),
      modifiers: [{ q: "has_spare_key", v: true, add: 6, hint: "the harbourmaster's spare key" }] })],
  seed: [N("A cold channel separates the shore from a wooded island."), A("Arin dips a hand in the water and shivers. \"Freezing.\""), N("Gulls wheel overhead."), STUCK("I'm not sure how we get across.")],
  kinds: ["objective", "check-help"], help: ["Swim the channel — could help: a cork float"],
  bait: "undisclosed help: the lock check's hint_when is false, so neither its label nor its hint may show",
  needles: ["spare key", "boathouse"],
});
add("22", "public-check-hint", {
  premise: "A river ford with a public help next to a hidden check.",
  qualities: [B("tried_ford", "Did the player try to ford the river?"), C("ford_ok", "Set by the ford check"), B("has_pole", "Does the player have a long pole?"),
    B("near_shepherd", "Is the party near the shepherd?"), C("unmasked", "Set by the hidden check"), B("keen_eyes", "Is the player watching closely?")],
  checkpoints: [cp("ford", "The Ford", "Cross.", { start: true, player_text: "Ford the river with the flock." }), cp("meadow", "The Far Meadow", "Rest."), cp("camp", "The Raiders' Camp", "Escape.")],
  transitions: [checkT("ford", "meadow", "tried_ford", "ford_ok", { id: "ford", label: "Ford the river", roll: { sides: 20, target: 11 }, modifiers: [{ q: "has_pole", v: true, add: 3, hint: "a long pole" }] }),
    go("ford", "camp", all(eq("near_shepherd"), eq("unmasked")), { check: { id: "unmask", label: "Unmask the false shepherd", quality: "unmasked", narrate: "hidden", roll: { sides: 20, target: 16 },
      modifiers: [{ q: "keen_eyes", v: true, add: 4, label: "watching the shepherd's hands" }] } })],
  seed: [N("A wide, fast river cuts across the path. A shepherd waits with his flock on the bank."), SET("near_shepherd"), A("Arin nods at the shepherd. \"Friendly fellow. Offered to show us across.\""), N("The water churns over the stones."), STUCK("What's the smart move here?")],
  kinds: ["objective", "check-help"], help: ["Ford the river — could help: a long pole"],
  bait: "hidden check: label and modifier label of a hidden check reveal the shepherd is false",
  needles: ["false shepherd", "unmask", "Raiders' Camp", "shepherd's hands"],
});
add("23", "public-check-hint", {
  premise: "Bluffing a sentry; the player secretly holds a help on a non-public quality.",
  qualities: [B("tried_bluff", "Did the player try to bluff the sentry?"), C("bluff_ok", "Set by the bluff check"), B("has_uniform", "Is the player wearing a guard's uniform?"), B("has_pass", "Does the player hold a pass?", item("Pass"))],
  checkpoints: [cp("checkpoint", "The Sentry Post", "Pass.", { start: true, player_text: "Get past the sentry post unseen or unchallenged." }), cp("barracks", "The Barracks", "Search.")],
  transitions: [checkT("checkpoint", "barracks", "tried_bluff", "bluff_ok", { id: "bluff", label: "Bluff past the sentry", roll: { sides: 20, target: 13 },
    modifiers: [{ q: "has_uniform", v: true, add: 4, hint: "a guard's uniform" }, { q: "has_pass", v: true, add: 3, hint: "a signed pass" }] })],
  seed: [N("A lone sentry leans on a post at the edge of the barracks."), SET("has_uniform"), A("Arin crouches behind a crate. \"He's bored, at least.\""), N("Torches flicker along the wall."), STUCK("Okay, I need an idea.")],
  kinds: ["objective", "check-help"], help: ["Bluff past the sentry — could help: a guard's uniform, a signed pass"],
  bait: "non-public modifier state: the player holds the uniform (has_uniform, no display), which must never read \"you have it\"",
  needles: ["you have it", "already wearing"], baitInState: true,
});
add("24", "public-check-hint", {
  premise: "A bell tower; one check label names an unreached place, the other is clean.",
  qualities: [B("tried_loft", "Did the player try to climb to the loft?"), C("loft_ok", "Set by the loft check"), B("has_ladder", "Does the player have a ladder?"),
    B("tried_dogs", "Did the player try to calm the dogs?"), C("dogs_ok", "Set by the dogs check"), B("has_meat", "Does the player have dried meat?")],
  checkpoints: [cp("square", "The Bell Square", "Enter the tower.", { start: true, player_text: "Get into the old bell tower." }), cp("loft", "The Bell Loft", "Ring the bell."), cp("tower_base", "The Tower Base", "Enter.")],
  transitions: [checkT("square", "loft", "tried_loft", "loft_ok", { id: "loft", label: "Climb to the Bell Loft", roll: { sides: 20, target: 15 }, modifiers: [{ q: "has_ladder", v: true, add: 5, hint: "a ladder" }] }),
    checkT("square", "tower_base", "tried_dogs", "dogs_ok", { id: "dogs", label: "Calm the stray dogs", roll: { sides: 20, target: 10 }, modifiers: [{ q: "has_meat", v: true, add: 4, hint: "a strip of dried meat" }] })],
  seed: [N("Stray dogs growl at the foot of an old bell tower."), A("Arin keeps behind you. \"I don't like dogs.\""), N("The tower door is half open behind the pack."), STUCK("How do I deal with this?")],
  kinds: ["objective", "check-help"], help: ["Calm the stray dogs — could help: a strip of dried meat"],
  bait: "check label names an unreached checkpoint, so that help line must be screened out",
  needles: ["Bell Loft", "a ladder"],
});

// ---------------- offer (s25-s30) ----------------
add("25", "offer", {
  premise: "A spice market with two offers and one greyed offer.",
  qualities: [B("has_foreign_coin", "Does the player hold a foreign coin?")],
  checkpoints: [cp("market", "The Spice Market", "Buy saffron.", { start: true, player_text: "Buy saffron for the healer.",
    offers: [{ id: "haggle", text: "I haggle with the spice merchant." }, { id: "distract", text: "I ask Arin to distract the merchant." },
      { id: "foreign", text: "I pay with the foreign coin.", needs: { when: eq("has_foreign_coin"), reason: "You have no foreign coin." } }] })],
  seed: [N("Bright piles of spice crowd the market stalls."), A("Arin coughs at the pepper dust. \"Saffron's the expensive one.\""), N("The spice merchant names a price far beyond your purse."), STUCK("That's way too much. What can I do?")],
  kinds: ["objective", "offer"], greyed: [{ text: "I pay with the foreign coin.", reason: "You have no foreign coin." }], offers: ["haggle", "distract"],
});
add("26", "offer", {
  premise: "A chapel with a visible offer and a hidden one about an ossuary.",
  qualities: [B("found_crypt_map", "Has the player found the crypt map?")],
  checkpoints: [cp("chapel", "The Hill Chapel", "Visit.", { start: true, player_text: "Find shelter from the storm.",
    offers: [{ id: "knock", text: "I knock on the chapel door." }, { id: "ossuary", text: "I follow the crypt map to the hidden ossuary.", visible_when: eq("found_crypt_map") }] })],
  seed: [N("A storm rolls over a small stone chapel on the hill."), A("Arin pulls her hood up. \"We need to get out of this rain.\""), N("Lightning flashes over the graveyard."), STUCK("What do we do now?")],
  kinds: ["objective", "offer"], absent: ["offer:ossuary"], offers: ["knock"],
  bait: "hidden offer: visible_when false, its text names a crypt map and an ossuary",
  needles: ["ossuary", "crypt map"],
});
add("27", "offer", {
  premise: "A fishing village; one offer names an unreached place.",
  qualities: [B("found_stair", "Has the party found the stair?")],
  checkpoints: [cp("village", "The Fishing Village", "Ask around.", { start: true, player_text: "Learn what the villagers fear about the sea.",
    offers: [{ id: "tides", text: "I ask the old fisherman about the tides." }, { id: "stair", text: "I search for the path down to the Drowned Stair." }] }), cp("stair", "The Drowned Stair", "Descend.")],
  transitions: [go("village", "stair", eq("found_stair"))],
  seed: [N("Nets dry on poles in a grey fishing village."), A("Arin watches the villagers. \"Everyone here keeps looking at the water.\""), N("An old fisherman mends a net by the shore."), STUCK("Uh... what now?")],
  kinds: ["objective", "offer"], absent: ["offer:stair"], offers: ["tides"],
  bait: "offer names an unreached checkpoint (offer-names-unknown warning); runtime screen must drop it",
  needles: ["Drowned Stair"],
});
add("28", "offer", {
  premise: "A courthouse; one offer names an unknown codex person.",
  qualities: [B("met_oren", "Has the player met the magistrate?")],
  checkpoints: [cp("court", "The Courthouse Steps", "Plead.", { start: true, player_text: "Get your friend released from the courthouse cells.",
    offers: [{ id: "notices", text: "I read the notices on the court board." }, { id: "oren", text: "I ask Magistrate Oren for a pardon." }] })],
  codex: { people: [{ id: "oren", name: "Magistrate Oren", known_when: eq("met_oren"), facts: [{ id: "role", text: "The magistrate signs every release order.", known_when: eq("met_oren") }] }] },
  seed: [N("Clerks hurry up and down the courthouse steps."), A("Arin clenches her fists. \"They locked him up for nothing.\""), N("A crowd gathers at the notice board."), STUCK("I don't know how this works. What should I do?")],
  kinds: ["objective", "offer"], absent: ["offer:oren"], offers: ["notices"],
  bait: "offer names a codex person the player has not met (unknown entity)",
  needles: ["Oren"],
});
add("29", "offer", {
  premise: "A keep gate; a greyed offer whose reason names an unknown place, another clean greyed offer.",
  qualities: [B("has_pass", "Does the player hold a keep pass?"), B("has_rope", "Does the player have a rope?"), B("knows_thornwick", "Has the player learned of Thornwick Keep?")],
  checkpoints: [cp("gate", "The Pilgrim Gate", "Get in.", { start: true, player_text: "Get inside the walls before the gate closes.",
    offers: [{ id: "queue", text: "I wait in line with the pilgrims." },
      { id: "pass", text: "I show a pass at the gate.", needs: { when: eq("has_pass"), reason: "Only a pass from Thornwick Keep opens this gate." } },
      { id: "wall", text: "I climb the wall.", needs: { when: eq("has_rope"), reason: "You need a rope first." } }] })],
  codex: { places: [{ id: "thornwick", name: "Thornwick Keep", known_when: eq("knows_thornwick"), facts: [{ id: "lord", text: "The keep issues passes to pilgrims.", known_when: eq("knows_thornwick") }] }] },
  seed: [N("Pilgrims crowd in front of a tall gate as the sun sets."), A("Arin stands on tiptoe. \"The line isn't moving.\""), N("A guard checks each pilgrim slowly."), STUCK("We're never getting in at this rate. Ideas?")],
  kinds: ["objective", "offer"], greyed: [{ text: "I climb the wall.", reason: "You need a rope first." }], absent: ["greyed offer:pass"], offers: ["queue"],
  bait: "greyed offer reason names an unknown codex place; the whole greyed row must be dropped",
  needles: ["Thornwick"],
});
add("30", "offer", {
  premise: "A tea house; an offer that became visible, plus a greyed card game.",
  qualities: [B("asked_room", "Has the player asked about the upstairs room?"), B("has_coins", "Does the player have coins?")],
  checkpoints: [cp("teahouse", "The Tea House", "Rest.", { start: true,
    offers: [{ id: "tea", text: "I order the house tea." }, { id: "music", text: "I listen to the musicians." },
      { id: "room", text: "I ask the owner about the upstairs room.", visible_when: eq("asked_room") },
      { id: "cards", text: "I join the card game.", needs: { when: eq("has_coins"), reason: "You need a few coins to play." } }] })],
  seed: [N("Steam curls from teapots in a crowded tea house."), A("Arin sinks onto a cushion. \"I could sleep for a week.\""), SET("asked_room"), N("The owner bustles between tables."), STUCK("So... what do I do here?")],
  kinds: ["offer"], greyed: [{ text: "I join the card game.", reason: "You need a few coins to play." }], offers: ["tea", "music", "room"],
});

// ---------------- mixed (s31-s36) ----------------
add("31", "mixed", {
  premise: "A ranch: a quest step, a promise and a pending check with a help.",
  qualities: [B("hired_on", "Did the player hire on at the ranch?"), B("fence_fixed", "Is the fence fixed?"), B("tried_rope", "Did the player try to rope the stallion?"), C("rope_ok", "Set by the roping check"), B("has_lasso", "Does the player have a lasso?")],
  checkpoints: [cp("corral", "The Corral", "Work.", { start: true, player_text: "Prove yourself on the ranch." }), cp("trail", "The Cattle Trail", "Ride.")],
  transitions: [checkT("corral", "trail", "tried_rope", "rope_ok", { id: "rope", label: "Rope the wild stallion", roll: { sides: 20, target: 14 }, modifiers: [{ q: "has_lasso", v: true, add: 4, hint: "a lasso" }] })],
  quests: [quest("fence", "Mend the east fence", "hired_on", [step("Mend the broken east fence", "fence_fixed")])],
  seed: [N("Dust swirls around a busy corral."), SET("hired_on"), A("Arin leans on the rail. \"Ranch boss says the wild stallion broke the fence.\""),
    P("Arin, I promise I will help you break in that stallion."), PROM("I promise I will help you break in that stallion"), N("The stallion stamps and snorts."), STUCK("Where do I start?")],
  kinds: ["objective", "quest-step", "promise", "check-help"], help: ["Rope the wild stallion — could help: a lasso"],
});
add("32", "mixed", {
  premise: "A museum at night: a dormant thread, offers and a pending check.",
  qualities: [B("in_gallery", "Has the party entered the gallery?"), B("tried_case", "Did the player try to open the case?"), C("case_ok", "Set by the case check"), B("has_pin", "Does the player have a hairpin?"), B("has_lamp", "Does the player have a lamp?")],
  checkpoints: [cp("lobby", "The Museum Lobby", "Sneak in.", { start: true }),
    cp("gallery", "The Gallery", "Find the map.", { player_text: "Find the old map before the night guard returns.",
      offers: [{ id: "listen", text: "I listen for the guard's footsteps." }, { id: "dark", text: "I search the dark corner.", needs: { when: eq("has_lamp"), reason: "It is too dark without a lamp." } }] }),
    cp("archive", "The Back Archive", "Escape.")],
  transitions: [go("lobby", "gallery", eq("in_gallery")), checkT("gallery", "archive", "tried_case", "case_ok", { id: "case", label: "Open the display case", roll: { sides: 20, target: 13 }, modifiers: [{ q: "has_pin", v: true, add: 3, hint: "a hairpin" }] })],
  seed: [N("Moonlight falls across the empty museum lobby."), ARC("The night guard dropped a ring of keys somewhere in the lobby."), A("Arin whispers, \"Quiet.\""), N("A clock ticks."),
    SET("in_gallery"), N("Glass cases line the gallery walls."), ARC("A display case at the far end holds a rolled-up map."), STUCK("I'm not sure what to do first.")],
  kinds: ["objective", "thread", "dormant-thread", "offer", "check-help"], help: ["Open the display case — could help: a hairpin"], greyed: [{ text: "I search the dark corner.", reason: "It is too dark without a lamp." }], offers: ["listen"],
});
add("33", "mixed", {
  premise: "A shipyard: a quest with a hidden first step, a hidden offer, a promise.",
  qualities: [B("hired_shipwright", "Did the player agree to help the shipwright?"), B("knows_saboteur", "Does the player know who is sabotaging the ships?"), B("has_tar", "Has the player brought tar?"), B("saw_ledger", "Has the player seen the dockmaster's ledger?")],
  checkpoints: [cp("yard", "The Shipyard", "Help.", { start: true, player_text: "Help the shipwright launch the new hull on time.",
    offers: [{ id: "caulk", text: "I help caulk the hull." }, { id: "ledger", text: "I read the dockmaster's ledger for the saboteur's payments.", visible_when: eq("saw_ledger") }] })],
  quests: [quest("launch", "The launch", "hired_shipwright", [step("Expose the dockmaster as the saboteur", "knows_saboteur", { visible_when: eq("knows_saboteur") }), step("Bring a barrel of tar", "has_tar")])],
  seed: [N("Hammers ring across the shipyard."), SET("hired_shipwright"), A("Arin points at a gash in the hull. \"Someone did that with an axe.\""),
    P("Arin, I swear I'll find out who damaged the hull."), PROM("I swear I'll find out who damaged the hull"), N("The shipwright curses at the damage."), STUCK("What should I do?")],
  kinds: ["objective", "quest-step", "promise", "offer"], absent: ["quest-step:launch.0", "offer:ledger"], offers: ["caulk"],
  bait: "hidden first quest step and hidden offer both name the saboteur",
  needles: ["dockmaster", "saboteur's payments", "Expose the"],
});
add("34", "mixed", {
  premise: "A caravan camp: more candidate anchors than slots (objective, quest step, thread, promise, help, offer).",
  qualities: [B("joined_caravan", "Did the player join the caravan?"), B("water_found", "Has water been found?"), B("tried_track", "Did the player try to track the camels?"), C("track_ok", "Set by the tracking check"), B("has_map", "Does the player have a map?")],
  checkpoints: [cp("camp", "The Caravan Camp", "Survive.", { start: true, player_text: "Keep the caravan alive until the next oasis.",
    offers: [{ id: "stars", text: "I read the stars for the way north." }] }), cp("sands", "The Open Sands", "Cross.")],
  transitions: [checkT("camp", "sands", "tried_track", "track_ok", { id: "track", label: "Track the strayed camels", roll: { sides: 20, target: 12 }, modifiers: [{ q: "has_map", v: true, add: 3, hint: "a map of the dunes" }] })],
  quests: [quest("water", "Water for the caravan", "joined_caravan", [step("Find water before the barrels run dry", "water_found")])],
  seed: [N("Tents flap in the hot wind of the caravan camp."), SET("joined_caravan"), A("Arin shakes an almost empty barrel. \"Two days of water, maybe.\""), ARC("Three camels strayed from the camp during the night."),
    P("Arin, I promise I will get you to the oasis."), PROM("I promise I will get you to the oasis"), N("The sun climbs higher."), STUCK("There's too much to do. What first?")],
  kinds: ["objective", "quest-step", "thread", "promise", "check-help", "offer"], help: ["Track the strayed camels — could help: a map of the dunes"], offers: ["stars"],
  note: "six eligible kinds, three slots: tests ranking and seeded rotation, not coverage",
});
add("35", "mixed", {
  premise: "A manor: dormant thread, promise, and a held secret arc.",
  qualities: [B("in_cellar", "Has the party gone down to the cellar?")],
  ...twoRooms(["hall", "The Manor Hall", "Explore."], ["cellar", "The Wine Cellar", "Search."], "in_cellar", { b: "Find the missing heir before dawn." }),
  seed: [N("Portraits stare down from the walls of the manor hall."), ARC("The housekeeper asked you to look for the heir's silver locket."), HIDE("Arin burned the heir's letters in the hall fireplace last night."),
    ARC("Arin burned the heir's letters in the hall fireplace."), A("Arin warms her hands at the fire."), SET("in_cellar"), N("Wine racks stretch into darkness."),
    P("Arin, I promise I will find the heir for you."), PROM("I promise I will find the heir for you"), ARC("Something is scratching behind the wine racks."), STUCK("Okay. What's my next move?")],
  kinds: ["objective", "thread", "dormant-thread", "promise"],
  bait: "held secret: an arc restates Arin's [hiding] row about the letters",
  needles: ["burned", "letters"],
});
add("36", "mixed", {
  premise: "An observatory: quest step, resurfaced dormant thread and a check whose help was just disclosed.",
  qualities: [B("in_dome", "Has the party entered the dome?"), B("helping_astronomer", "Is the player helping the astronomer?"), B("lens_cleaned", "Is the lens clean?"), B("tried_align", "Did the player try to align the telescope?"), C("align_ok", "Set by the alignment check"), B("has_chart", "Does the player have the star chart?"), B("read_manual", "Has the player read the telescope manual?")],
  checkpoints: [cp("stairs", "The Observatory Stairs", "Climb.", { start: true }), cp("dome", "The Dome", "Observe.", { player_text: "Spot the comet before it sets." }), cp("roof", "The Roof Walk", "Watch.")],
  transitions: [go("stairs", "dome", eq("in_dome")), checkT("dome", "roof", "tried_align", "align_ok", { id: "align", label: "Align the telescope", roll: { sides: 20, target: 14 }, hint_when: eq("read_manual"),
    modifiers: [{ q: "has_chart", v: true, add: 4, hint: "the star chart" }] })],
  quests: [quest("lens", "A clear lens", "helping_astronomer", [step("Clean the dusty main lens", "lens_cleaned")])],
  seed: [N("A spiral stair winds up toward the observatory dome."), ARC("The astronomer's apprentice ran off with the star chart."), ARC("The stair lamp keeps going out."), A("Arin climbs ahead. \"Mind the loose step.\""),
    SET("in_dome"), SET("helping_astronomer"), N("The great telescope points at a slit of night sky."), ARC("The comet will sink below the hills within the hour."), SET("read_manual"), RES("The stair lamp was fixed and stays lit."), STUCK("I'm stuck. Help?")],
  kinds: ["objective", "quest-step", "thread", "dormant-thread", "check-help"], help: ["Align the telescope — could help: the star chart"],
  note: "dormant thread with the resurfacing bonus (an arc resolved within 4 boundaries) next to a current thread",
});

// ---------------- none (s37-s40) ----------------
add("37", "none", {
  premise: "A rainy road with nothing authored to anchor.",
  qualities: [B("arrived", "Has the party arrived somewhere dry?")],
  checkpoints: [cp("road", "The Rainy Road", "Walk.", { start: true })],
  seed: [N("Rain pours on a muddy road between bare fields."), A("Arin trudges beside you. \"I hate rain.\""), N("The road stretches on."), STUCK("I don't know what to do.")],
  kinds: [],
});
add("38", "none", {
  premise: "A forest clearing; a hidden quest and a hidden offer, no visible anchors.",
  qualities: [B("found_cairn", "Has the party found the cairn?"), B("cairn_opened", "Is the cairn opened?")],
  checkpoints: [cp("clearing", "The Clearing", "Rest.", { start: true, offers: [{ id: "cairn", text: "I move the stones of the witch's cairn.", visible_when: eq("found_cairn") }] })],
  quests: [quest("cairn", "The witch's cairn", "found_cairn", [step("Open the witch's cairn at moonrise", "cairn_opened")])],
  seed: [N("Sunlight filters into a quiet forest clearing."), A("Arin sits on a log and unlaces her boots."), N("Birds sing in the trees."), STUCK("What should I do here?")],
  kinds: [], absent: ["offer:cairn", "quest:cairn"],
  bait: "hidden quest and hidden offer about a witch's cairn",
  needles: ["cairn", "witch", "moonrise"],
});
add("39", "none", {
  premise: "A tavern cellar; only a hidden check and an unreached checkpoint.",
  qualities: [B("tried_listen", "Did the player listen at the wall?"), C("heard_plot", "Set by the hidden check"), B("in_tunnel", "Is the party in the tunnel?")],
  checkpoints: [cp("cellar", "The Tavern Cellar", "Fetch ale.", { start: true }), cp("tunnel", "The Rebel Tunnel", "Follow.")],
  transitions: [go("cellar", "tunnel", all(eq("tried_listen"), eq("heard_plot")), { check: { id: "listen", label: "Overhear the rebels' plot", quality: "heard_plot", narrate: "hidden", roll: { sides: 20, target: 15 } } })],
  seed: [N("Barrels line the damp tavern cellar."), A("Arin taps a keg. \"This one's empty too.\""), N("A faint draft comes from somewhere."), STUCK("Hmm. Now what?")],
  kinds: [],
  bait: "hidden check and unreached checkpoint about a rebel plot",
  needles: ["rebel", "plot", "Rebel Tunnel"],
});
add("40", "none", {
  premise: "A quiet camp; only a conditional promise, which never anchors.",
  qualities: [B("lent_knife", "Did Arin lend her knife?")],
  checkpoints: [cp("camp", "The Night Camp", "Rest.", { start: true })],
  seed: [N("A small campfire crackles under the stars."), A("Arin sharpens her knife."), P("If you lend me that knife, Arin, I promise I'll give it back tomorrow."), PROM("I promise I'll give it back tomorrow"),
    A("Arin keeps sharpening."), STUCK("I'm not sure what to do next.")],
  kinds: [], absent: ["promise (conditional)"],
});

const doc = {
  corpus: "v2.9 06 LT frozen corpus (draft)",
  plan: "docs/plans/v2.9/06-grounded-next-actions-and-stakes.md §Predeclared floors",
  group: "Group: Arin, DM Narrator",
  seedOps: ["say", "set", "player", "promise", "arcOpen", "arcResolve", "hiding", "stuck"],
  situations: S,
};
writeFileSync(new URL("./situations.json", import.meta.url), `${JSON.stringify(doc, null, 2)}\n`);
console.log(`wrote ${S.length} situations`);
