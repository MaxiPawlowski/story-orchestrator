import type { Feature } from "./registry";
import { settingsAt } from "./where";

export const READ_CONTRACT_FEATURES: readonly Feature[] = [
  {
    id: "neighbour-read", name: "Read sees nearby memories", area: "memory", audience: "author",
    oneLine: "The story read sees the stored memories about who and what it is reading, and can mark a line as a repeat or a change of one.",
    what: "Before each story read, up to 12 stored memories that name a person or thing in the window are listed in the read, under short labels (m1, m2...). "
      + "A memory line may then say same=m3 (nothing new: the stored memory is confirmed) or update=m3 (the new line replaces that memory, which is kept as "
      + "history). A line with no label is new, as before. Kept-out secrets are never listed, locked or decided memories are never replaced, and a swipe or "
      + "edit takes the confirmation or the replacement back. No extra model call. Measured offline; not rated yet.",
    where: settingsAt("#so-neighbour-read", "Authoring › Prompt trials"),
    settings: ["memory.neighbourRead"], doc: "player/memory.md", status: "shipped", needs: ["story"],
  },
  {
    id: "read-keys", name: "Lookup words on memories", area: "memory", audience: "author",
    oneLine: "The story read can give a memory up to three short lookup words, so it is found when the chat later uses one of them.",
    what: "A memory line may carry keys=\"word,word,word\": an object, place, nickname or theme someone might use later. Keys are stored on the memory; the "
      + "memory score counts a key named in the last messages like a trigger, and archive recall brings a memory back when the chat names one of its keys. "
      + "Secrets stay behind the same filter. No extra model call. Measured offline; not rated yet.",
    where: settingsAt("#so-read-keys", "Authoring › Prompt trials"),
    settings: ["memory.readKeys"], doc: "player/memory.md", status: "shipped", needs: ["story"],
  },
  {
    id: "relation-rows", name: "Relations with several partners", area: "memory", audience: "author",
    oneLine: "The story read can record standing relations between two named people or things, several at once.",
    what: "A [rel:Subject:relation] Object line records a relation such as ally_of, serves or owes in the state ledger. One subject can hold the same relation to "
      + "several others at once; [rel-end:...] keeps the ended relation as history. Names fold to the cast and the story's places on both ends, and opposite "
      + "relations (ally and enemy, trusts and distrusts) are queued as a conflict for you. Shown under Current state. No extra model call. Not rated yet.",
    where: settingsAt("#so-relation-rows", "Authoring › Prompt trials"),
    settings: ["memory.relationRows"], doc: "player/memory.md", status: "shipped", needs: ["story"],
  },
  {
    id: "social-acts", name: "Social acts behind feelings", area: "memory", audience: "author",
    oneLine: "A feeling change can carry what was done (helped, lied, insulted...), and story gates can count those acts over recent turns.",
    what: "When the story read moves a relationship feeling, it may add act=lied (or helped, protected, threatened, insulted, gifted, betrayed, confided). "
      + "The engine keeps a short log per pair, and a gate leaf {\"act\": \"lied\", \"by\": \"player\", \"to\": \"mira\", \"within\": 10} counts it; a "
      + "story pattern can use the act kind too. An act by you needs your own line as evidence. A swipe or edit takes it back. No extra model call. Not rated yet.",
    where: settingsAt("#so-social-acts", "Authoring › Prompt trials"),
    settings: ["memory.socialActs"], doc: "player/memory.md", status: "shipped", needs: ["story"],
  },
];
