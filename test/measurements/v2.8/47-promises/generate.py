import json, sys, os

OUT = sys.argv[1]
P = "Rowan"
NAMES = {"mira": "Mira", "tobin": "Tobin", "edda": "Edda", "corvin": "Corvin"}

story = {
  "format": 2,
  "id": "so-p47-suite",
  "title": "SO-P47 Promise Suite",
  "description": "Plan 47 P1/P2/P8 measurement story: a generic river town, four cast members, one read-scoped value so the shared read runs.",
  "qualities": [
    {"key": "town_mood", "type": "enum", "values": ["calm", "uneasy", "festive"], "source": "extractor", "rubric": "How does the town feel right now?"}
  ],
  "checkpoints": [
    {"id": "town", "name": "River Town", "player_name": "River Town", "type": "anchor", "start": True, "objective": "Spend a few days in the river town."}
  ],
  "transitions": [],
  "roster": [
    {"id": "mira", "name": "Mira", "role": "healer"},
    {"id": "tobin", "name": "Tobin", "role": "blacksmith"},
    {"id": "edda", "name": "Edda", "role": "scout"},
    {"id": "corvin", "name": "Corvin", "role": "merchant"}
  ],
  "requirements": {"members": ["Mira", "Tobin", "Edda", "Corvin"]}
}

def msgs(lines):
  out = []
  for speaker, text in lines:
    out.append({"speaker": NAMES.get(speaker, speaker), "text": text, "user": speaker == P})
  return out

p1 = []
def case(category, label, lines, gold=(), bait=(), note=None):
  chat = msgs(lines)
  index = len([c for c in p1 if c["label"] == label]) + 1
  cid = f"p1-{'pos' if label == 'promise' else 'neg'}-{index:03d}"
  def row(entry):
    who, m, quote = entry
    assert quote in chat[m]["text"], (cid, quote)
    return {"promisee": who, "messageId": m, "quote": quote}
  def brow(entry):
    who, m, quote = entry
    assert quote in chat[m]["text"], (cid, quote)
    return {"target": NAMES.get(who, who), "messageId": m, "quote": quote}
  c = {"id": cid, "category": category, "label": label, "chat": chat, "gold": [row(g) for g in gold]}
  if label == "promise":
    assert c["gold"], cid
    for g in c["gold"]: assert chat[g["messageId"]]["user"], cid
  else:
    assert not c["gold"], cid
    c["bait"] = [brow(b) for b in bait]
    assert c["bait"], cid
  if note: c["note"] = note
  p1.append(c)

def pos(category, lines, gold, note=None):
  case(category, "promise", lines, gold, note=note)

def neg(category, lines, bait, note=None):
  case(category, "none", lines, bait=bait, note=note)

# ---------- positives ----------
pos("plain", [("mira", "My brother went north with the caravan and never wrote back."), (P, "Mira, I promise I'll find your brother before the snows come.")],
    [("mira", 1, "I promise I'll find your brother before the snows come")])
pos("plain", [("tobin", "The guild wants this hammer back, and I can't leave the forge."), (P, "Tobin, I promise I will carry the hammer to the guild hall myself.")],
    [("tobin", 1, "I promise I will carry the hammer to the guild hall myself")])
pos("plain", [("edda", "Nobody ever comes back to the watchtower once they leave."), (P, "I promise you, Edda, I'll come back to the watchtower.")],
    [("edda", 1, "I promise you, Edda, I'll come back to the watchtower")])
pos("plain", [("corvin", "My ledger was stolen off the dock. Everything I own is written in it."), (P, "Corvin, I promise to get your ledger back from whoever took it.")],
    [("corvin", 1, "I promise to get your ledger back from whoever took it")])
pos("plain", [("mira", "The orphans haven't eaten properly in days."), (P, "I promise, Mira, the orphans will have bread on their table tomorrow.")],
    [("mira", 1, "I promise, Mira, the orphans will have bread on their table tomorrow")])
pos("plain", [("tobin", "Keep my daughter out of the fighting, that's all I ask."), (P, "Tobin, I promise I'll keep your daughter away from the fighting.")],
    [("tobin", 1, "I promise I'll keep your daughter away from the fighting")])
pos("plain", [("edda", "You're going to tell the captain I fell asleep on watch, aren't you?"), (P, "Edda, I promise I'll never tell the captain about last night.")],
    [("edda", 1, "I promise I'll never tell the captain about last night")])
pos("plain", [("corvin", "The bridge toll is ruining me."), (P, "I promise I'll speak to the reeve about the bridge toll for you, Corvin.")],
    [("corvin", 1, "I promise I'll speak to the reeve about the bridge toll for you")])
pos("plain", [("mira", "These herbs only grow on the far bank."), (P, "Mira, I promise I will bring you a basket of marsh herbs from the far bank.")],
    [("mira", 1, "I promise I will bring you a basket of marsh herbs from the far bank")])
pos("plain", [("tobin", "My old anvil sank in the river when the ferry tipped."), (P, "Tobin, I promise I'll pull your anvil out of the river.")],
    [("tobin", 1, "I promise I'll pull your anvil out of the river")])

pos("answering", [("mira", "Will you look after my cat while I'm at the shrine?"), (P, "I promise I'll feed her every morning.")],
    [("mira", 1, "I promise I'll feed her every morning")])
pos("answering", [("tobin", "Don't let the apprentice touch the bellows while I'm gone."), (P, "I promise I won't let him near the bellows.")],
    [("tobin", 1, "I promise I won't let him near the bellows")], note="negation after the commitment word is part of the promise")
pos("answering", [("edda", "Swear you'll stay on the path past the old mill."), (P, "I swear I'll stay on the path.")],
    [("edda", 1, "I swear I'll stay on the path")])
pos("answering", [("corvin", "I need the spice crates counted before the barge leaves."), (P, "I promise they'll be counted before the barge leaves.")],
    [("corvin", 1, "I promise they'll be counted before the barge leaves")])
pos("answering", [("mira", "Promise me you'll rest tonight. Your wound needs it."), (P, "I promise. I'll rest tonight.")],
    [("mira", 1, "I promise. I'll rest tonight")])
pos("answering", [("tobin", "The sword is for my son's naming day. It cannot be late."), (P, "You have my word it will be there for the naming day.")],
    [("tobin", 1, "You have my word it will be there for the naming day")])
pos("answering", [("edda", "If the bells ring, someone has to warn the farms."), (P, "I'll warn the farms for you myself.")],
    [("edda", 1, "I'll warn the farms for you myself")])
pos("answering", [("corvin", "Keep this letter sealed until you reach my sister."), (P, "I promise I won't open it until I reach your sister.")],
    [("corvin", 1, "I promise I won't open it until I reach your sister")])

pos("oath", [("mira", "They burned my garden once. I can't watch it happen again."), (P, "Mira, I swear on my mother's grave that nobody will burn your garden again.")],
    [("mira", 1, "I swear on my mother's grave that nobody will burn your garden again")])
pos("oath", [("tobin", "I need someone I can trust with the forge keys."), (P, "Tobin, I give you my word I'll guard the forge keys.")],
    [("tobin", 1, "I give you my word I'll guard the forge keys")])
pos("oath", [("edda", "The scouts take an oath. Will you take it with me?"), (P, "Edda, I vow to stand watch beside you until the winter ends.")],
    [("edda", 1, "I vow to stand watch beside you until the winter ends")])
pos("oath", [("corvin", "Words are cheap at the market."), (P, "Then take mine, Corvin: on my word, I'll pay you back every coin by the next fair.")],
    [("corvin", 1, "on my word, I'll pay you back every coin by the next fair")])
pos("oath", [("mira", "You keep saying you'll stay."), (P, "Mira, you have my word I'm not leaving the town without you.")],
    [("mira", 1, "you have my word I'm not leaving the town without you")])
pos("oath", [("tobin", "My father's blade was stolen by the ferryman's crew."), (P, "I swear to you, Tobin, I'll get your father's blade back.")],
    [("tobin", 1, "I swear to you, Tobin, I'll get your father's blade back")])
pos("oath", [("edda", "Promise me something real for once."), (P, "Edda, I swear I'll teach you to read before the spring.")],
    [("edda", 1, "I swear I'll teach you to read before the spring")])
pos("oath", [("corvin", "Can I count on you at the auction?"), (P, "Corvin, I vow I'll be at the auction to bid for you.")],
    [("corvin", 1, "I vow I'll be at the auction to bid for you")])

pos("deadline", [("mira", "The fever breaks in three days or not at all."), (P, "Mira, I promise I'll bring the willow bark within three days.")],
    [("mira", 1, "I promise I'll bring the willow bark within three days")])
pos("deadline", [("tobin", "The shipment of iron has to be paid by the new moon."), (P, "Tobin, I promise you'll have the money by the new moon.")],
    [("tobin", 1, "I promise you'll have the money by the new moon")])
pos("deadline", [("edda", "The pass closes at sundown."), (P, "Edda, I promise I'll be through the pass before sundown.")],
    [("edda", 1, "I promise I'll be through the pass before sundown")])
pos("deadline", [("corvin", "Bring the map before the fair ends, or the buyer walks."), (P, "Corvin, I promise the map will be in your hands before the fair ends.")],
    [("corvin", 1, "I promise the map will be in your hands before the fair ends")])
pos("deadline", [("mira", "The midwife leaves at dawn."), (P, "I promise I'll fetch the midwife back here by dawn, Mira.")],
    [("mira", 1, "I promise I'll fetch the midwife back here by dawn")])
pos("deadline", [("tobin", "The festival is in a week and the bell is still cracked."), (P, "Tobin, I promise to find a bell-founder within the week.")],
    [("tobin", 1, "I promise to find a bell-founder within the week")])
pos("deadline", [("edda", "The scouts report to the captain tomorrow."), (P, "Edda, I swear the report will be finished by tomorrow morning.")],
    [("edda", 1, "I swear the report will be finished by tomorrow morning")])
pos("deadline", [("corvin", "Rent is due at the end of the month."), (P, "Corvin, you'll get the rent from me by the end of the month, I promise.")],
    [("corvin", 1, "you'll get the rent from me by the end of the month, I promise")])

pos("future-commitment", [("mira", "I can't carry all of these jars alone."), (P, "Mira, I'll carry every jar up the hill for you.")],
    [("mira", 1, "I'll carry every jar up the hill for you")])
pos("future-commitment", [("tobin", "Somebody keeps stealing coal from my yard."), (P, "Tobin, I will stand guard over your coal yard tonight.")],
    [("tobin", 1, "I will stand guard over your coal yard tonight")])
pos("future-commitment", [("edda", "I need someone to cover my watch on the east wall."), (P, "I'll cover your watch on the east wall, Edda.")],
    [("edda", 1, "I'll cover your watch on the east wall")])
pos("future-commitment", [("corvin", "My cart wheel snapped on the road."), (P, "Corvin, I shall mend your cart wheel before you set out.")],
    [("corvin", 1, "I shall mend your cart wheel before you set out")])
pos("future-commitment", [("mira", "Nobody visits my mother anymore."), (P, "I will visit your mother every week, Mira.")],
    [("mira", 1, "I will visit your mother every week")])
pos("future-commitment", [("tobin", "Will you stand with me when the guild comes?"), (P, "I'll stand with you when the guild comes, Tobin.")],
    [("tobin", 1, "I'll stand with you when the guild comes")])

pos("multiple-recipients", [("mira", "We can't hold the clinic alone."), ("tobin", "And I can't leave the forge."), (P, "Mira, Tobin, I promise I'll come back with help for you.")],
    [("mira", 2, "I promise I'll come back with help for you"), ("tobin", 2, "I promise I'll come back with help for you")])
pos("multiple-recipients", [("edda", "The tower needs supplies."), ("corvin", "And somebody has to pay for them."), (P, "Edda and Corvin, I swear I'll get the supplies to the tower and pay for them myself.")],
    [("edda", 2, "I swear I'll get the supplies to the tower and pay for them myself"), ("corvin", 2, "I swear I'll get the supplies to the tower and pay for them myself")])
pos("multiple-recipients", [("mira", "The children are frightened of the storm."), ("edda", "So are the scouts, honestly."), (P, "Mira, Edda, I promise I'll keep the lamps burning all night for you.")],
    [("mira", 2, "I promise I'll keep the lamps burning all night for you"), ("edda", 2, "I promise I'll keep the lamps burning all night for you")])
pos("multiple-recipients", [("tobin", "The mayor wants our heads for the broken gate."), ("corvin", "Mine especially."), (P, "Tobin and Corvin, you have my word I'll speak for you before the mayor.")],
    [("tobin", 2, "you have my word I'll speak for you before the mayor"), ("corvin", 2, "you have my word I'll speak for you before the mayor")])
pos("multiple-recipients", [("mira", "Who will look after the sick when you go?"), ("tobin", "And the forge fire?"), (P, "Mira, I promise to find another healer. Tobin, I promise to find you an apprentice.")],
    [("mira", 2, "I promise to find another healer"), ("tobin", 2, "I promise to find you an apprentice")])
pos("multiple-recipients", [("edda", "You keep disappearing at night."), ("mira", "We worry about you."), (P, "Edda, Mira, I swear I'll tell you where I go from now on.")],
    [("edda", 2, "I swear I'll tell you where I go from now on"), ("mira", 2, "I swear I'll tell you where I go from now on")])

pos("embedded", [("corvin", "You look like you've seen a ghost."), (P, "I sit down on the crate and rub my eyes. It's been a long night. Corvin, I promise I'll explain everything once we're inside.")],
    [("corvin", 1, "I promise I'll explain everything once we're inside")])
pos("embedded", [("mira", "Hold still, this will sting."), (P, "I wince and grip the table. Mira, I promise I'll come back and pay you for the bandages.")],
    [("mira", 1, "I promise I'll come back and pay you for the bandages")])
pos("embedded", [("tobin", "So you lost the commission."), (P, "I stare at the floor for a while. Tobin, I swear I'll make this right with the guild.")],
    [("tobin", 1, "I swear I'll make this right with the guild")])
pos("embedded", [("edda", "The fog's rolling in fast."), (P, "I pull my cloak tighter and look at the ridge. Edda, I promise I'll stay close to you in the fog.")],
    [("edda", 1, "I promise I'll stay close to you in the fog")])
pos("embedded", [("corvin", "My daughter thinks you're a hero."), (P, "I laugh and shake my head. Tell her I said hello. Corvin, I promise I'll take her to see the river boats.")],
    [("corvin", 1, "I promise I'll take her to see the river boats")])
pos("embedded", [("mira", "The well water tastes of rust."), (P, "I sniff the bucket and frown. Mira, I'll clean the well for you this week, I promise.")],
    [("mira", 1, "I'll clean the well for you this week, I promise")])

pos("negative-promise", [("tobin", "Don't ever tell anyone what you saw in the cellar."), (P, "Tobin, I promise I'll never tell a soul about the cellar.")],
    [("tobin", 1, "I promise I'll never tell a soul about the cellar")])
pos("negative-promise", [("edda", "Don't leave me at the crossroads again."), (P, "Edda, I swear I will never leave you behind again.")],
    [("edda", 1, "I swear I will never leave you behind again")])
pos("negative-promise", [("corvin", "Keep your hands off my strongbox."), (P, "Corvin, I promise I won't touch your strongbox.")],
    [("corvin", 1, "I promise I won't touch your strongbox")])
pos("negative-promise", [("mira", "Don't drink from the black spring."), (P, "Mira, you have my word I won't drink from the black spring.")],
    [("mira", 1, "you have my word I won't drink from the black spring")])

pos("asked-then-given", [("tobin", "Promise me you'll bring the boy home."), (P, "Tobin, I promise. I'll bring him home.")],
    [("tobin", 1, "I promise. I'll bring him home")])
pos("asked-then-given", [("edda", "Will you give me your word on the bridge plan?"), (P, "You have my word, Edda.")],
    [("edda", 1, "You have my word")])
pos("asked-then-given", [("corvin", "Swear you'll tell no one the price."), (P, "I swear it, Corvin. Nobody hears the price from me.")],
    [("corvin", 1, "I swear it, Corvin")])
pos("asked-then-given", [("mira", "Promise you'll eat something today."), (P, "Fine, Mira. I promise I'll eat something today.")],
    [("mira", 1, "I promise I'll eat something today")])

# ---------- negatives ----------
neg("hedge", [("tobin", "Can you fix the roof before the rain?"), (P, "Maybe I'll help you with the roof, Tobin.")], [("tobin", 1, "Maybe I'll help you with the roof")])
neg("hedge", [("edda", "The ring fell down the well."), (P, "Edda, I might be able to bring your ring back.")], [("edda", 1, "I might be able to bring your ring back")])
neg("hedge", [("mira", "Could you find more bandages?"), (P, "Mira, perhaps I could promise that, but I need to see the market first.")], [("mira", 1, "perhaps I could promise that")])
neg("hedge", [("corvin", "I need my coin back from the toll-keeper."), (P, "I'll try to get your coin back, Corvin, but no guarantees.")], [("corvin", 1, "I'll try to get your coin back, Corvin, but no guarantees")], note="a try with no guarantee is not a commitment")
neg("hedge", [("tobin", "Will you have the charcoal by morning?"), (P, "Tobin, I should be able to have the charcoal by morning.")], [("tobin", 1, "I should be able to have the charcoal by morning")])
neg("hedge", [("mira", "Will you sit with me at the vigil?"), (P, "I'd probably come to the vigil, Mira, if I'm not too tired.")], [("mira", 1, "I'd probably come to the vigil")])
neg("hedge", [("edda", "The captain wants the map redrawn."), (P, "Edda, I could maybe redraw the map, I'm not sure yet.")], [("edda", 1, "I could maybe redraw the map")])
neg("hedge", [("corvin", "Will you guard the wagon tonight?"), (P, "Corvin, I'm thinking I'll guard the wagon, but let me sleep on it.")], [("corvin", 1, "I'm thinking I'll guard the wagon")])

neg("refusal", [("tobin", "Promise me you'll stay away from the guild."), (P, "No, Tobin. I won't promise you that.")], [("tobin", 1, "I won't promise you that")])
neg("refusal", [("mira", "Swear you'll come back."), (P, "Mira, I can't swear to anything right now.")], [("mira", 1, "I can't swear to anything right now")])
neg("refusal", [("edda", "Take the scouts' vow with me."), (P, "Edda, I will not take that vow.")], [("edda", 1, "I will not take that vow")], note="a refusal phrased with 'I will not'")
neg("refusal", [("corvin", "Promise to buy the whole crate."), (P, "Corvin, I refuse to promise something I can't pay for.")], [("corvin", 1, "I refuse to promise something I can't pay for")])
neg("refusal", [("mira", "Promise me you'll stop fighting."), (P, "I'm not going to promise that, Mira.")], [("mira", 1, "I'm not going to promise that")])
neg("refusal", [("tobin", "Give me your word on the hammer."), (P, "Tobin, I never give my word on things I can't control.")], [("tobin", 1, "I never give my word on things I can't control")])
neg("refusal", [("edda", "Will you swear to guard the tower?"), (P, "No. I don't swear oaths anymore, Edda.")], [("edda", 1, "I don't swear oaths anymore")])
neg("refusal", [("corvin", "You'll pay me back by the fair, yes?"), (P, "Corvin, I won't be paying you back by the fair. I'm sorry.")], [("corvin", 1, "I won't be paying you back by the fair")])

neg("double-negative", [("mira", "You're not coming back, are you?"), (P, "Mira, I won't not come back for you.")], [("mira", 1, "I won't not come back for you")], note="held by design (v2.7 09 fail-safe)")
neg("double-negative", [("tobin", "So you promise or not?"), (P, "Tobin, it's not that I won't promise, it's that I can't.")], [("tobin", 1, "it's not that I won't promise")])
neg("double-negative", [("edda", "You said you'd never swear to it."), (P, "Edda, I never said I wouldn't swear to it.")], [("edda", 1, "I never said I wouldn't swear to it")])
neg("double-negative", [("corvin", "Can I count on you or not?"), (P, "Corvin, I can't say I won't let you down.")], [("corvin", 1, "I can't say I won't let you down")])
neg("double-negative", [("mira", "Will you be at the shrine?"), (P, "Mira, it isn't impossible that I won't be at the shrine.")], [("mira", 1, "it isn't impossible that I won't be at the shrine")])
neg("double-negative", [("tobin", "Tell me you'll help."), (P, "Tobin, I'm not saying I won't help, but don't count on it.")], [("tobin", 1, "I'm not saying I won't help")])

neg("npc-promise", [("mira", "I promise I'll have the salve ready by dusk, Rowan."), (P, "Thank you, Mira.")], [("mira", 0, "I promise I'll have the salve ready by dusk")])
neg("npc-promise", [("tobin", "You have my word, Rowan, the blade will be sharp by morning."), (P, "Good. I'll come by early.")], [("tobin", 0, "You have my word, Rowan, the blade will be sharp by morning")])
neg("npc-promise", [("edda", "I swear I'll guide you through the marsh."), (P, "Then let's go, Edda.")], [("edda", 0, "I swear I'll guide you through the marsh")])
neg("npc-promise", [("corvin", "I promise to hold the room for you until the fair."), (P, "That's kind of you.")], [("corvin", 0, "I promise to hold the room for you until the fair")])
neg("npc-promise", [(P, "Can you watch my horse?"), ("mira", "I promise I'll watch your horse until you're back.")], [("mira", 1, "I promise I'll watch your horse until you're back")])
neg("npc-promise", [(P, "Will the gate be fixed?"), ("tobin", "I'll fix the gate before nightfall, I promise you.")], [("tobin", 1, "I'll fix the gate before nightfall, I promise you")])
neg("npc-promise", [("edda", "I vow to keep your secret, Rowan."), (P, "I appreciate that.")], [("edda", 0, "I vow to keep your secret")])
neg("npc-promise", [(P, "Do you trust me with the ledger?"), ("corvin", "I do. And I promise I'll never doubt you again.")], [("corvin", 1, "I promise I'll never doubt you again")])

neg("quoting", [("mira", "What did the smith tell you?"), (P, "Tobin told me, \"I promise I'll fix your blade by morning.\"")], [("tobin", 1, "I promise I'll fix your blade by morning")])
neg("quoting", [("tobin", "And Edda?"), (P, "\"I swear I'll return before dark,\" Edda said to me.")], [("edda", 1, "I swear I'll return before dark")])
neg("quoting", [("edda", "Why do you hate promises?"), (P, "My father always said \"I promise I'll come home\" and he never did.")], [("edda", 1, "I promise I'll come home")])
neg("quoting", [("mira", "Did Corvin pay you?"), (P, "Corvin promised he'd pay me back, but nothing yet.")], [("corvin", 1, "Corvin promised he'd pay me back")], note="reported speech without quote marks")
neg("quoting", [("corvin", "What did the captain want?"), (P, "She told the guards, \"I will hang the next thief myself.\"")], [("corvin", 1, "I will hang the next thief myself")])
neg("quoting", [("tobin", "What's written on the old sign?"), (P, "It says \"I promise to protect this town\" in faded red paint.")], [("tobin", 1, "I promise to protect this town")], note="reading a sign aloud")
neg("quoting", [("edda", "What did Mira say?"), (P, "Mira said she'd promise to bring the herbs, if she found any.")], [("mira", 1, "she'd promise to bring the herbs")])

neg("sarcasm", [("tobin", "You'll scrub all the pots, right?"), (P, "Oh sure, Tobin, I promise I'll scrub every pot in the keep. Yeah, right.")], [("tobin", 1, "I promise I'll scrub every pot in the keep")])
neg("sarcasm", [("corvin", "Give me your whole purse as a deposit."), (P, "Corvin, I'll hand you my whole purse, I swear. As if.")], [("corvin", 1, "I'll hand you my whole purse, I swear")])
neg("sarcasm", [("mira", "You'll be up at dawn to help me?"), (P, "I roll my eyes. Mira, I promise I'll leap out of bed at dawn, singing.")], [("mira", 1, "I promise I'll leap out of bed at dawn, singing")])
neg("sarcasm", [("edda", "Promise to love the marsh like I do."), (P, "Edda, I swear I'll adore every mosquito in that marsh. /s")], [("edda", 1, "I swear I'll adore every mosquito in that marsh")])
neg("sarcasm", [("tobin", "You'll carry the anvil up the tower?"), (P, "Absolutely, Tobin, I'll carry the anvil up all four hundred steps with one hand, I swear, right after the river runs uphill.")], [("tobin", 1, "I'll carry the anvil up all four hundred steps with one hand, I swear")], note="sarcasm carried by context, no marker word")
neg("sarcasm", [("corvin", "So you'll lend me the boat for free?"), (P, "Of course, Corvin, I promise to lend you the boat for free forever, and the moon too.")], [("corvin", 1, "I promise to lend you the boat for free forever")], note="sarcasm carried by context, no marker word")

neg("conditional", [("corvin", "The crate costs thirty silver."), (P, "Corvin, if you lower the price, I'll buy the whole crate.")], [("corvin", 1, "if you lower the price, I'll buy the whole crate")])
neg("conditional", [("mira", "The clinic needs a new roof."), (P, "Mira, if the council pays for the timber, I promise I'll build it.")], [("mira", 1, "I promise I'll build it")])
neg("conditional", [("tobin", "I need an extra pair of hands."), (P, "Tobin, I'll help you at the forge, as long as you teach me to weld.")], [("tobin", 1, "I'll help you at the forge, as long as you teach me to weld")], note="condition after the verb")
neg("conditional", [("edda", "Come scouting with me."), (P, "Edda, unless the captain forbids it, I'll come scouting with you.")], [("edda", 1, "I'll come scouting with you")])
neg("conditional", [("corvin", "Guard my stall tomorrow."), (P, "Corvin, provided you pay me first, I swear I'll guard your stall.")], [("corvin", 1, "I swear I'll guard your stall")])
neg("conditional", [("mira", "Will you carry the medicine to the farms?"), (P, "Only when the road dries out, Mira. Then I'll carry it for you.")], [("mira", 1, "Then I'll carry it for you")], note="condition in the previous sentence")
neg("conditional", [("tobin", "Help me move the bellows."), (P, "Tobin, once you finish the commission, I promise I'll help with the bellows.")], [("tobin", 1, "I promise I'll help with the bellows")])

neg("casual-future", [("edda", "Where are you off to?"), (P, "I'll check the stables.")], [("edda", 1, "I'll check the stables")])
neg("casual-future", [("mira", "Are you hungry?"), (P, "I'll grab some bread on the way.")], [("mira", 1, "I'll grab some bread on the way")])
neg("casual-future", [("tobin", "Busy day tomorrow?"), (P, "I will look around the market tomorrow.")], [("tobin", 1, "I will look around the market tomorrow")])
neg("casual-future", [("corvin", "Staying for supper?"), (P, "No, I'll eat at the inn tonight.")], [("corvin", 1, "I'll eat at the inn tonight")])
neg("casual-future", [("edda", "Where will you be?"), (P, "Edda, I'll be at the tavern if anyone asks.")], [("edda", 1, "I'll be at the tavern if anyone asks")], note="named addressee, plain plan")
neg("casual-future", [("mira", "It's late."), (P, "Mira, I'll head to bed soon.")], [("mira", 1, "I'll head to bed soon")], note="named addressee, plain plan")
neg("casual-future", [("tobin", "Rain's coming."), (P, "I'll take the long road home then.")], [("tobin", 1, "I'll take the long road home then")])
neg("casual-future", [("corvin", "Seen the new barge?"), (P, "Not yet. I'll walk down to the docks later.")], [("corvin", 1, "I'll walk down to the docks later")])

neg("question", [("mira", "You have to be careful out there."), (P, "Mira, will you promise me that you'll be careful too?")], [("mira", 1, "will you promise me that you'll be careful too")], note="the player asks the cast member for a promise")
neg("question", [("tobin", "I need a guarantee."), (P, "Should I swear it on the anvil, Tobin?")], [("tobin", 1, "Should I swear it on the anvil")])
neg("question", [("edda", "You keep leaving."), (P, "Do you want me to promise I'll stay, Edda?")], [("edda", 1, "Do you want me to promise I'll stay")])
neg("question", [("corvin", "I want this in writing."), (P, "Corvin, would my word be enough for you?")], [("corvin", 1, "would my word be enough for you")])

neg("group", [("mira", "We're trapped in here."), ("tobin", "The door won't budge."), (P, "I promise I'll get you all out of here.")], [("mira", 2, "I promise I'll get you all out of here")])
neg("group", [("edda", "Nobody believes we'll make it."), ("corvin", "Least of all me."), (P, "Everyone, I swear we'll make it to the coast.")], [("edda", 2, "I swear we'll make it to the coast")])
neg("group", [("mira", "Where are you going?"), ("edda", "And when are you back?"), (P, "You two, I promise I'll be back by nightfall.")], [("mira", 2, "I promise I'll be back by nightfall")])
neg("group", [("tobin", "Can we rely on you?"), ("corvin", "Well?"), (P, "Both of you have my word.")], [("tobin", 2, "Both of you have my word")])

pos_cases = [c for c in p1 if c["label"] == "promise"]
neg_cases = [c for c in p1 if c["label"] == "none"]
gold_rows = sum(len(c["gold"]) for c in pos_cases)
assert len(pos_cases) >= 60 and len(neg_cases) >= 60, (len(pos_cases), len(neg_cases))

# ---------- P2 ----------
p2 = []
def p2case(kind_label, lines, seeds, read_from, event, note=None, category=None):
  chat = msgs(lines)
  cid = f"p2-{len(p2) + 1:03d}"
  out_seeds = []
  for key, who, m, quote in seeds:
    assert chat[m]["user"] and quote in chat[m]["text"], (cid, quote)
    assert m < read_from, cid
    out_seeds.append({"key": key, "promisee": who, "messageId": m, "quote": quote})
  ev = None
  if event:
    key, kind, m, quote = event
    assert m >= read_from and quote in chat[m]["text"], (cid, quote)
    ev = {"key": key, "kind": kind, "messageId": m, "quote": quote}
  c = {"id": cid, "category": category or (event[1] if event else "control"), "chat": chat, "seed": out_seeds, "read": [read_from, len(chat) - 1], "event": ev}
  if note: c["note"] = note
  p2.append(c)

def A(m, who, quote): return ("a", who, m, quote)
def B(m, who, quote): return ("b", who, m, quote)
def C(m, who, quote): return ("c", who, m, quote)

# kept (10)
p2case("kept", [("mira", "My lantern broke in the storm."), (P, "Mira, I promise I'll bring you a new lantern from the market."), ("mira", "I'll hold you to it."),
  (P, "Here you are, Mira. A new lantern, straight from the market."), ("mira", "Oh, it's lovely. You kept your word.")],
  [A(1, "mira", "I promise I'll bring you a new lantern from the market")], 3, ("a", "kept", 4, "You kept your word"))
p2case("kept", [("tobin", "Fetch me iron from the mine."), (P, "Tobin, I promise I'll fetch the iron from the mine."), ("edda", "Let me come with you to the mine."), (P, "Edda, I swear I'll take you along next time."),
  (P, "I drop the sack of iron on Tobin's bench. There's your iron, Tobin, as promised."), ("tobin", "Good ore, too. Thank you.")],
  [A(1, "tobin", "I promise I'll fetch the iron from the mine"), B(3, "edda", "I swear I'll take you along next time")], 4, ("a", "kept", 4, "There's your iron, Tobin, as promised"))
p2case("kept", [("edda", "Teach me the knot for the ferry ropes."), (P, "Edda, I promise I'll teach you the ferry knot."), ("corvin", "And my debt?"), (P, "Corvin, I promise I'll settle my debt to you."),
  (P, "Watch my hands, Edda. Over, under, through. That's the ferry knot."), ("edda", "I've got it! Thank you for teaching me.")],
  [A(1, "edda", "I promise I'll teach you the ferry knot"), B(3, "corvin", "I promise I'll settle my debt to you")], 4, ("a", "kept", 5, "Thank you for teaching me"))
p2case("kept", [("corvin", "My strongbox key is at the bottom of the canal."), (P, "Corvin, I swear I'll dive for your key."), ("corvin", "Be careful down there."),
  (P, "I climb out of the canal, dripping, and hold up the key. Your key, Corvin."), ("corvin", "You actually found it. I owe you.")],
  [A(1, "corvin", "I swear I'll dive for your key")], 3, ("a", "kept", 3, "Your key, Corvin"))
p2case("kept", [("mira", "The orphans need blankets."), (P, "Mira, I promise I'll bring blankets for the orphans."), ("mira", "And the roof leaks."), (P, "Mira, I promise I'll patch the clinic roof too."),
  ("mira", "The blankets you brought are warm. The children slept through the night.")],
  [A(1, "mira", "I promise I'll bring blankets for the orphans"), B(3, "mira", "I promise I'll patch the clinic roof too")], 4, ("a", "kept", 4, "The blankets you brought are warm"),
  note="two open promises to the same member; the evidence names one")
p2case("kept", [("tobin", "Don't tell anyone about the cracked bell."), (P, "Tobin, I promise I won't tell anyone about the bell."), ("corvin", "What's this about a bell?"),
  (P, "What bell? I don't know anything about a bell, Corvin."), ("tobin", "Thanks for keeping quiet back there.")],
  [A(1, "tobin", "I promise I won't tell anyone about the bell")], 2, ("a", "kept", 4, "Thanks for keeping quiet back there"))
p2case("kept", [("edda", "Bring my bow back from the repair shop."), (P, "Edda, I promise I'll collect your bow from the shop."), ("mira", "Don't forget my herbs either."), (P, "Mira, I'll pick up your herbs too, I promise."),
  ("mira", "You brought my herbs. Exactly the ones I needed.")],
  [A(1, "edda", "I promise I'll collect your bow from the shop"), B(3, "mira", "I'll pick up your herbs too, I promise")], 4, ("b", "kept", 4, "You brought my herbs"))
p2case("kept", [("corvin", "Pay me by the fair."), (P, "Corvin, I promise I'll pay you every coin by the fair."), ("corvin", "The fair is today."),
  (P, "I count thirty silver into Corvin's palm. Every coin, Corvin, paid in full."), ("corvin", "Paid in full. We're square.")],
  [A(1, "corvin", "I promise I'll pay you every coin by the fair")], 3, ("a", "kept", 3, "Every coin, Corvin, paid in full"))
p2case("kept", [("mira", "Visit my mother this week."), (P, "Mira, I promise I'll visit your mother this week."), ("tobin", "And you'll help me load the cart?"), (P, "Tobin, I promise I'll help you load the cart."),
  ("tobin", "Cart's loaded. Couldn't have done it without you."), ("mira", "My mother says nobody visited.")],
  [A(1, "mira", "I promise I'll visit your mother this week"), B(3, "tobin", "I promise I'll help you load the cart")], 4, ("b", "kept", 4, "Cart's loaded. Couldn't have done it without you"),
  note="Mira's line is not evidence of anything closing")
p2case("kept", [("edda", "Keep watch on the east wall tonight."), (P, "Edda, I swear I'll keep watch on the east wall tonight."), ("edda", "Dawn already? You stayed up there all night?"),
  (P, "All night on the east wall, Edda, just like I said.")],
  [A(1, "edda", "I swear I'll keep watch on the east wall tonight")], 2, ("a", "kept", 3, "All night on the east wall, Edda, just like I said"))

# broken (7)
p2case("broken", [("tobin", "Bring my hammer back from the guild."), (P, "Tobin, I promise I'll bring your hammer back from the guild."), ("tobin", "Well? Where is it?"),
  (P, "I'm sorry, Tobin. I can't get the hammer back. The guild melted it down.")],
  [A(1, "tobin", "I promise I'll bring your hammer back from the guild")], 2, ("a", "broken", 3, "I'm sorry, Tobin. I can't get the hammer back"))
p2case("broken", [("mira", "Stay for the festival."), (P, "Mira, I promise I'll stay for the festival."), ("corvin", "And you'll mind my stall?"), (P, "Corvin, I promise I'll mind your stall at the festival."),
  (P, "Mira, I won't be staying for the festival after all. I have to leave tonight."), ("mira", "Oh. I see.")],
  [A(1, "mira", "I promise I'll stay for the festival"), B(3, "corvin", "I promise I'll mind your stall at the festival")], 4, ("a", "broken", 4, "I won't be staying for the festival after all"),
  note="leaving also makes the stall promise doubtful, but only the festival promise is refused in words")
p2case("broken", [("edda", "Keep the scouts' secret."), (P, "Edda, I swear I'll keep the scouts' secret."), ("corvin", "Tell me about the scouts or no deal."),
  (P, "Fine, Corvin. I'll break my word. The scouts hide their boats under the willow bank.")],
  [A(1, "edda", "I swear I'll keep the scouts' secret")], 2, ("a", "broken", 3, "I'll break my word"))
p2case("broken", [("corvin", "Pay me back by the fair."), (P, "Corvin, I promise I'll pay you back by the fair."), ("tobin", "And my coal money?"), (P, "Tobin, I promise you'll have your coal money too."),
  (P, "Tobin, I can't pay you for the coal. The money's gone."), ("tobin", "Gone? All of it?")],
  [A(1, "corvin", "I promise I'll pay you back by the fair"), B(3, "tobin", "I promise you'll have your coal money too")], 4, ("b", "broken", 4, "Tobin, I can't pay you for the coal"))
p2case("broken", [("mira", "Never drink from the black spring."), (P, "Mira, I promise I'll never drink from the black spring."), ("edda", "You look pale."),
  (P, "I drank from the black spring, Mira. I broke my promise. I was so thirsty.")],
  [A(1, "mira", "I promise I'll never drink from the black spring")], 2, ("a", "broken", 3, "I broke my promise"))
p2case("broken", [("tobin", "Train my apprentice this winter."), (P, "Tobin, I promise I'll train your apprentice this winter."), ("edda", "Come north with me this winter."),
  (P, "Tobin, I'm not going to train the boy. I'm going north with Edda instead."), ("tobin", "You gave me your word.")],
  [A(1, "tobin", "I promise I'll train your apprentice this winter")], 2, ("a", "broken", 3, "I'm not going to train the boy"))
p2case("broken", [("edda", "Wait for me at the crossroads."), (P, "Edda, I promise I'll wait for you at the crossroads."), ("mira", "And you'll bring me the moss?"), (P, "Mira, I promise to bring you the moss."),
  (P, "Edda, I didn't wait at the crossroads. I failed you. The riders came and I ran.")],
  [A(1, "edda", "I promise I'll wait for you at the crossroads"), B(3, "mira", "I promise to bring you the moss")], 4, ("a", "broken", 4, "I didn't wait at the crossroads. I failed you"))

# renegotiated (8)
p2case("renegotiated", [("mira", "Bring the midwife by dawn."), (P, "Mira, I promise I'll bring the midwife by dawn."), ("mira", "Any news?"),
  (P, "Mira, the road's flooded. Can I bring her by noon instead?"), ("mira", "Noon, then. Bring her by noon.")],
  [A(1, "mira", "I promise I'll bring the midwife by dawn")], 2, ("a", "renegotiated", 4, "Noon, then. Bring her by noon"))
p2case("renegotiated", [("corvin", "Thirty silver by the fair."), (P, "Corvin, I promise you'll have thirty silver by the fair."), ("corvin", "The fair is close."),
  (P, "Corvin, what if I pay fifteen now and fifteen at the harvest?"), ("corvin", "Fifteen now, fifteen at harvest. Agreed.")],
  [A(1, "corvin", "I promise you'll have thirty silver by the fair")], 2, ("a", "renegotiated", 4, "Fifteen now, fifteen at harvest. Agreed"))
p2case("renegotiated", [("tobin", "Mend the gate this week."), (P, "Tobin, I promise I'll mend the gate this week."), ("edda", "Help me with the tower roof this week."), (P, "Edda, I promise to fix the tower roof."),
  (P, "Tobin, I'll mend the gate next week instead, after the tower roof."), ("tobin", "Next week is fine. The gate can wait.")],
  [A(1, "tobin", "I promise I'll mend the gate this week"), B(3, "edda", "I promise to fix the tower roof")], 4, ("a", "renegotiated", 5, "Next week is fine. The gate can wait"))
p2case("renegotiated", [("edda", "Teach me to read before spring."), (P, "Edda, I swear I'll teach you to read before spring."), ("edda", "Spring's coming fast."),
  (P, "Edda, could we say before summer? I'm away most of the spring."), ("edda", "Before summer, then. But no later.")],
  [A(1, "edda", "I swear I'll teach you to read before spring")], 2, ("a", "renegotiated", 4, "Before summer, then. But no later"))
p2case("renegotiated", [("mira", "Bring me a basket of marsh herbs."), (P, "Mira, I promise I'll bring you a basket of marsh herbs."), ("corvin", "Are you coming to the auction?"), (P, "Corvin, I vow I'll be at the auction."),
  ("mira", "The marsh is too dangerous now. Bring me dried herbs from the market instead."), (P, "Dried herbs from the market it is, Mira.")],
  [A(1, "mira", "I promise I'll bring you a basket of marsh herbs"), B(3, "corvin", "I vow I'll be at the auction")], 4, ("a", "renegotiated", 4, "Bring me dried herbs from the market instead"))
p2case("renegotiated", [("corvin", "Guard my stall all week."), (P, "Corvin, I promise I'll guard your stall all week."), ("corvin", "How's the guarding?"),
  (P, "Corvin, I can do three nights, not the whole week. Is that enough?"), ("corvin", "Three nights. I'll hire someone for the rest.")],
  [A(1, "corvin", "I promise I'll guard your stall all week")], 2, ("a", "renegotiated", 4, "Three nights. I'll hire someone for the rest"))
p2case("renegotiated", [("tobin", "Find me an apprentice by winter."), (P, "Tobin, I promise I'll find you an apprentice by winter."), ("mira", "Find me another healer too."), (P, "Mira, I promise to find another healer."),
  ("tobin", "Forget the apprentice. Just send me a strong pair of hands for the forge."), (P, "A strong pair of hands for the forge. I'll find them, Tobin.")],
  [A(1, "tobin", "I promise I'll find you an apprentice by winter"), B(3, "mira", "I promise to find another healer")], 4, ("a", "renegotiated", 4, "Just send me a strong pair of hands for the forge"))
p2case("renegotiated", [("edda", "Meet me at the watchtower at sundown."), (P, "Edda, I promise I'll meet you at the watchtower at sundown."), ("edda", "Still coming?"),
  (P, "Edda, can we meet at the mill instead? The tower road is blocked."), ("edda", "The mill is fine. I'll see you there.")],
  [A(1, "edda", "I promise I'll meet you at the watchtower at sundown")], 2, ("a", "renegotiated", 4, "The mill is fine. I'll see you there"))

# released (7)
p2case("released", [("mira", "Find my brother."), (P, "Mira, I promise I'll find your brother."), ("mira", "A letter came today. My brother is safe in the capital."),
  ("mira", "You don't owe me that search anymore, Rowan. Let it go.")],
  [A(1, "mira", "I promise I'll find your brother")], 2, ("a", "released", 3, "You don't owe me that search anymore, Rowan. Let it go"))
p2case("released", [("tobin", "Pull my anvil from the river."), (P, "Tobin, I promise I'll pull your anvil out of the river."), ("corvin", "And my cart wheel?"), (P, "Corvin, I'll mend your cart wheel, I promise."),
  ("tobin", "I bought a new anvil. Forget the old one, you're free of that promise.")],
  [A(1, "tobin", "I promise I'll pull your anvil out of the river"), B(3, "corvin", "I'll mend your cart wheel, I promise")], 4, ("a", "released", 4, "Forget the old one, you're free of that promise"))
p2case("released", [("edda", "Stand watch with me all winter."), (P, "Edda, I vow to stand watch beside you through the winter."), ("edda", "I'm being sent south."),
  ("edda", "I release you from your vow, Rowan. Stay here and keep warm.")],
  [A(1, "edda", "I vow to stand watch beside you through the winter")], 2, ("a", "released", 3, "I release you from your vow"))
p2case("released", [("corvin", "Bid for me at the auction."), (P, "Corvin, I promise I'll bid for you at the auction."), ("mira", "Will you still help at the clinic?"), (P, "Mira, I promise I'll help at the clinic tomorrow."),
  ("corvin", "The auction's cancelled. No need to bid for me."), ("mira", "See you at the clinic tomorrow, then.")],
  [A(1, "corvin", "I promise I'll bid for you at the auction"), B(3, "mira", "I promise I'll help at the clinic tomorrow")], 4, ("a", "released", 4, "No need to bid for me"))
p2case("released", [("mira", "Bring the willow bark."), (P, "Mira, I promise I'll bring the willow bark."), ("tobin", "And you'll help me at the forge?"), (P, "Tobin, I swear I'll help at the forge."),
  ("tobin", "My nephew is back. He'll help at the forge. You don't need to keep that promise.")],
  [A(1, "mira", "I promise I'll bring the willow bark"), B(3, "tobin", "I swear I'll help at the forge")], 4, ("b", "released", 4, "You don't need to keep that promise"))
p2case("released", [("tobin", "Keep my daughter from the fighting."), (P, "Tobin, I promise I'll keep your daughter from the fighting."), ("tobin", "The war's over."),
  ("tobin", "She's safe now. Consider your promise kept... no, released. You owe me nothing.")],
  [A(1, "tobin", "I promise I'll keep your daughter from the fighting")], 2, ("a", "released", 3, "You owe me nothing"))
p2case("released", [("edda", "Never leave me at the crossroads."), (P, "Edda, I swear I'll never leave you at the crossroads."), ("corvin", "Edda's moving to the city."),
  ("edda", "I'm leaving town for good. That oath was for the road, Rowan, and the road is done. You're released.")],
  [A(1, "edda", "I swear I'll never leave you at the crossroads")], 2, ("a", "released", 3, "You're released"))

# controls (6): talk about an open promise, nothing closes
p2case("control", [("mira", "Find my brother."), (P, "Mira, I promise I'll find your brother."), ("mira", "Any word yet?"), (P, "Not yet, Mira. I haven't forgotten my promise.")],
  [A(1, "mira", "I promise I'll find your brother")], 2, None)
p2case("control", [("tobin", "Mend the gate."), (P, "Tobin, I promise I'll mend the gate."), ("tobin", "The gate's still broken."), (P, "I'm on it, Tobin. Tomorrow I start on the hinges.")],
  [A(1, "tobin", "I promise I'll mend the gate")], 2, None)
p2case("control", [("corvin", "Pay me back."), (P, "Corvin, I promise I'll pay you back."), ("edda", "Did you ever pay Corvin?"), (P, "Not yet, Edda. Soon.")],
  [A(1, "corvin", "I promise I'll pay you back")], 2, None, note="a third party asks; nothing closes")
p2case("control", [("edda", "Teach me the knot."), (P, "Edda, I promise I'll teach you the ferry knot."), ("mira", "Can you teach me a knot too?"), (P, "Maybe later, Mira.")],
  [A(1, "edda", "I promise I'll teach you the ferry knot")], 2, None)
p2case("control", [("mira", "Bring blankets."), (P, "Mira, I promise I'll bring blankets."), ("tobin", "I have spare wool."), (P, "Thanks, Tobin. That'll help with the blankets.")],
  [A(1, "mira", "I promise I'll bring blankets")], 2, None, note="progress, not fulfilment")
p2case("control", [("tobin", "Keep quiet about the bell."), (P, "Tobin, I promise I won't tell anyone about the bell."), ("corvin", "Rumour says the bell is cracked."), ("tobin", "Rumours. Nothing more.")],
  [A(1, "tobin", "I promise I won't tell anyone about the bell")], 2, None)

events = [c for c in p2 if c["event"]]
assert len(events) >= 30, len(events)

# ---------- P6 ----------
P6_CASES = [
  ("The Flooded Mill", "A river town recovers from a spring flood.", "mira", "I promise I'll find your brother before the snows come", "Search the Ferry Landing", "The ferryman says a caravan passed north three weeks ago."),
  ("Forge and Guild", "A blacksmith fights the guild for his livelihood.", "tobin", "I promise I will carry the hammer to the guild hall myself", "The Guild Steps", "Guild wardens bar the hall doors and demand a fee."),
  ("Watchtower Winter", "Scouts hold a tower through a hard winter.", "edda", "I vow to stand watch beside you until the winter ends", "Frost on the East Wall", "A signal fire flares on the ridge at midnight."),
  ("The Stolen Ledger", "A merchant's ledger holds half the town's debts.", "corvin", "I promise to get your ledger back from whoever took it", "Dockside Rumours", "A dockhand hints that the ledger changed hands at the tannery."),
  ("Fever Season", "A fever spreads through the lower town.", "mira", "I promise I'll bring the willow bark within three days", "The Apothecary's Shutters", "The apothecary has closed and the willow bark is locked inside."),
  ("Naming Day", "A father prepares for his son's naming day.", "tobin", "You have my word it will be there for the naming day", "Eve of the Naming", "The sword still lacks a hilt and the festival is tomorrow."),
  ("The Marsh Path", "A scout guides travellers across a treacherous marsh.", "edda", "I swear I'll stay on the path", "Lights in the Reeds", "Will-o'-wisps dance off the path, and a voice calls from them."),
  ("Market Debts", "A merchant's patience runs thin.", "corvin", "on my word, I'll pay you back every coin by the next fair", "The Fair Opens", "Corvin sets up his stall and watches the crowd for a familiar face."),
  ("Garden of Ashes", "A healer rebuilds a burned garden.", "mira", "I swear on my mother's grave that nobody will burn your garden again", "Smoke at Dusk", "Strangers with torches gather at the garden wall."),
  ("Keys of the Forge", "Someone wants into the forge at night.", "tobin", "I give you my word I'll guard the forge keys", "A Knock After Dark", "A hooded figure offers gold for one night with the keys."),
  ("Letters Home", "A scout cannot read the letters she receives.", "edda", "I swear I'll teach you to read before the spring", "The Unopened Letter", "A letter with a black seal arrives for Edda."),
  ("The Auction", "A rare map goes under the hammer.", "corvin", "I vow I'll be at the auction to bid for you", "Auction Morning", "A rival buyer arrives with a fat purse and hired guards."),
  ("The Cellar", "A secret lies beneath the smithy.", "tobin", "I promise I'll never tell a soul about the cellar", "Questions from the Reeve", "The reeve asks pointed questions about noises under the smithy."),
  ("The Crossroads", "Old wounds between two travellers.", "edda", "I swear I will never leave you behind again", "Riders on the Road", "Riders appear on the road behind them, closing fast."),
  ("The Strongbox", "A merchant guards his savings.", "corvin", "I promise I won't touch your strongbox", "The Open Lid", "Corvin finds his strongbox open and coins missing."),
  ("Black Spring", "A poisoned spring lies outside town.", "mira", "you have my word I won't drink from the black spring", "A Dry Road", "The wells along the road are dry, and only the black spring flows."),
  ("Bring Him Home", "A boy went missing in the hills.", "tobin", "I promise. I'll bring him home", "Tracks in the Snow", "Small footprints lead toward the wolf caves."),
  ("Supplies for the Tower", "The tower is short of food.", "edda", "I swear I'll get the supplies to the tower and pay for them myself", "The Quartermaster's Price", "The quartermaster doubles the price of flour overnight."),
  ("Speaking for Friends", "The mayor judges two accused men.", "corvin", "you have my word I'll speak for you before the mayor", "The Mayor's Court", "The court opens and the mayor calls the first witness."),
  ("The Long Night", "A storm threatens the town.", "mira", "I promise I'll keep the lamps burning all night for you", "Wind at the Shutters", "The oil runs low as the storm reaches its height."),
]
p6 = {"format": "so-p47-p6/1", "synthetic": True, "player": P, "cast": [{"id": k, "name": v} for k, v in NAMES.items()], "cases": []}
for i, (title, premise, who, quote, frontier, canon) in enumerate(P6_CASES, 1):
  p6["cases"].append({"id": f"p6-{i:03d}", "title": title, "premise": premise, "promisee": who, "quote": quote,
    "frontier": {"id": "cp_now", "name": frontier, "objective": canon}, "canon": canon, "otherThreads": ["Rumours of bandits on the north road"]})
assert len(p6["cases"]) == 20

os.makedirs(OUT, exist_ok=True)
def dump(name, data):
  with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(data, indent=1, ensure_ascii=False) + "\n")

dump("story.json", story)
dump("p1-cases.json", {"format": "so-p47-p1/1", "synthetic": True, "player": P, "story": "story.json", "cases": p1})
dump("p2-cases.json", {"format": "so-p47-p2/1", "synthetic": True, "player": P, "story": "story.json", "cases": p2})
dump("p6-director.json", p6)
from collections import Counter
print("p1 pos", len(pos_cases), "gold rows", gold_rows, "neg", len(neg_cases))
print(Counter((c["label"], c["category"]) for c in p1))
print("p2 events", len(events), Counter(c["category"] for c in p2))
