import type { StoryDraft } from "../draft";
import { sampleStory } from "../stories/fixtures";

export const gameStory = (): StoryDraft => ({
  ...sampleStory(),
  quests: [{
    id: "debt", title: "The ferryman's debt", kind: "side", giver: "guide", done_when: { all: [] },
    visible_when: { all: [{ q: "trust", op: ">=", v: 1 }] },
    steps: [{ text: "Find the ledger", done_when: { all: [{ q: "alarm", op: "==", v: false }] } }],
  }],
  milestones: [{ id: "crossing", title: "First crossing", when: { all: [{ q: "trust", op: ">=", v: 2 }] } }],
  widgets: [{ id: "alarm-clock", kind: "clock", title: "The alarm", audience: "player", bind: { quality: "trust" } }],
});

export const widgetStory = (): StoryDraft => ({
  ...sampleStory(),
  widgets: [
    {
      id: "clue-wall", kind: "clues", title: "Clue wall", audience: "player",
      clues: [
        { id: "bell", text: "Someone rang the ruin bell.", when: { q: "alarm", op: "==", v: true }, action: "I ask who rang the bell." },
        { id: "door", text: "The guide knows a side door.", when: { q: "trust", op: ">=", v: 3 } },
      ],
      links: [{ from: "bell", to: "door", label: "a way in" }],
    },
    {
      id: "ruins-map", kind: "map", title: "The ruins", audience: "player", image: "ruins.jpg",
      pins: [{ id: "gate", label: "The gate", x: 20, y: 60, checkpoint: "start" }, { id: "cache", label: "The cache", x: 70, y: 30, checkpoint: "cache" }],
    },
    { id: "case-board", kind: "html", title: "Case board", audience: "player", source: "clue-wall", template: "<p>board</p>", actions: [{ id: "ask", text: "I ask who rang the bell." }] },
  ],
});

export const factionStory = (): StoryDraft => {
  const base = sampleStory();
  return {
    ...base,
    roster: base.roster.map((member, at) => (at === 0 ? { ...member, factions: ["guild"] } : member)),
    factions: [{
      id: "guild", name: "The Guild", range: [-5, 5], start: 0,
      bands: [{ max: -3, label: "Hostile" }, { max: -1, label: "Wary" }, { max: 2, label: "Neutral" }, { label: "Trusted" }],
      moves: [{ id: "helped", when: { q: "trust", op: ">=", v: 2 }, add: 2, heard_by: "present" }],
    }],
  };
};

export const labelStory = (): StoryDraft => {
  const base = sampleStory();
  return {
    ...base,
    qualities: [...base.qualities, { key: "saw_letter", type: "bool", source: "extractor", rubric: "Whether the player read the letter." }],
    roster: base.roster.map((member, at) => (at === 0 ? {
      ...member,
      relationships: [{
        toward: "player", axes: ["trust"], range: [-5, 5], step: 1, start: 0,
        public: [{ label: "wary" }], secret: [{ id: "loyal", label: "secretly loyal to you", revealed_when: { q: "saw_letter", op: "==", v: true } }],
      }],
    } : member)),
  };
};

export const commitmentStory = (): StoryDraft => {
  const base = sampleStory();
  return {
    ...base,
    roster: base.roster.map((member, index) => (index === 0 ? {
      ...member,
      commitments: [{ id: "gate", to: "player", what: "get past the north gate together", made_when: { q: "trust", op: ">=", v: 1 }, kept_when: { q: "alarm", op: "==", v: true } }],
    } : member)),
  };
};

export const cueStory = (): StoryDraft => {
  const base = sampleStory();
  return {
    ...base,
    roster: base.roster.map((member, index) => (index === 0 ? {
      ...member,
      cues: [{ id: "alarm", kind: "reaction", when: { q: "alarm", op: "==", v: true }, cue: "the alarm bell rang at the gate" }],
      topics: [{ id: "gate", keys: ["gate"], tiers: [{ cue: "the gate sticks in the rain" }] }],
    } : member)),
    norms: [{ id: "bell", label: "nobody rings the bell for nothing", broken_when: { q: "alarm", op: "==", v: true }, noticed_by: [base.roster[0].id], cue: "someone rang the bell" }],
  };
};

export const codexStory = (): StoryDraft => ({
  ...sampleStory(),
  qualities: [...sampleStory().qualities, { key: "location", type: "enum", values: ["gate", "boathouse"], source: "extractor", rubric: "Where the party is." }],
  codex: {
    people: [{
      id: "ferryman", member: "guide", facts: [
        { id: "job", text: "Runs the night crossing.", known_when: { reached: "infiltrate" } },
        { id: "debt", text: "Owes money upriver.", known_when: { q: "trust", op: ">=", v: 2 }, source: "boathouse" },
      ],
    }],
    places: [{ id: "boathouse", name: "The boathouse", location: "boathouse", facts: [{ id: "door", text: "The back door does not lock.", known_when: { q: "alarm", op: "==", v: false } }] }],
  },
});

export const observationStory = (): StoryDraft => ({
  ...codexStory(),
  observations: [
    { id: "scratches", text: "Fresh scratches circle the lock.", when: { reached: "infiltrate" }, source: "boathouse" },
    { id: "pitch", text: "You sense a smell of pitch; you should check the boat.", when: { q: "trust", op: ">=", v: 1 }, passive: { roll: { sides: 20, target: 12 } } },
  ],
});

export const rumorStory = (): StoryDraft => {
  const base = sampleStory();
  const [first] = base.roster;
  return {
    ...base,
    roster: [{ ...first, gossip: { talks_to: ["keeper"], contact: "any", delay: { boundaries: [1, 2] } } }, ...base.roster.slice(1), { id: "keeper", name: "The Keeper" }],
    rumors: [{ id: "flood", from: first.id, claim: "the lower road flooded", versions: [{ text: "the lower road flooded", truth: "true", weight: 2 }] }],
  };
};

export const patternStory = (): StoryDraft => ({
  ...gameStory(),
  patterns: [{
    id: "two-favours", steps: [{ kind: "quest", to: "done", where: { giver: "?who" } }, { kind: "quest", to: "done", where: { giver: "?who" } }],
    label: { text: "Two favours done for the same patron." }, pending: "One more favour would make two.",
  }],
});
