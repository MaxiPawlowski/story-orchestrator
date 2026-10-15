import type { CodexEntry, CodexPage, Faction, Milestone, QualityDisplay, Quest, RelationshipDecl, RosterMember, StoryCheck, StoryCodex, StoryWidget } from "@engine/index";
import type { StoryClock } from "@engine/lifeSchema";
import type { StoryDraft } from "./draft";
import { nextId, updateCheckpoint, updateQuality, updateTransition } from "./mutations";

type ListKey = "quests" | "milestones" | "widgets" | "factions";

const withList = <K extends ListKey>(draft: StoryDraft, key: K, items: NonNullable<StoryDraft[K]>): StoryDraft => {
  const rest: StoryDraft = { ...draft };
  delete rest[key];
  return items.length ? { ...rest, [key]: items } : rest;
};

export const newQuest = (id: string): Quest => ({ id, title: id, kind: "side", done_when: { all: [] }, steps: [] });

export const setQuests = (draft: StoryDraft, quests: Quest[]): StoryDraft => withList(draft, "quests", quests);

export const addQuest = (draft: StoryDraft, quest?: Quest): StoryDraft => {
  const quests = draft.quests ?? [];
  if (quest && quests.some((entry) => entry.id === quest.id)) return draft;
  return setQuests(draft, [...quests, quest ?? newQuest(nextId(quests.map((entry) => entry.id), "quest"))]);
};

export const updateQuest = (draft: StoryDraft, id: string, patch: Partial<Omit<Quest, "id">>): StoryDraft =>
  setQuests(draft, (draft.quests ?? []).map((quest) => (quest.id === id ? { ...quest, ...patch } : quest)));

export const removeQuest = (draft: StoryDraft, id: string): StoryDraft => setQuests(draft, (draft.quests ?? []).filter((quest) => quest.id !== id));

export const newMilestone = (id: string): Milestone => ({ id, title: id, when: { all: [] } });

export const setMilestones = (draft: StoryDraft, milestones: Milestone[]): StoryDraft => withList(draft, "milestones", milestones);

export const addMilestone = (draft: StoryDraft, milestone?: Milestone): StoryDraft => {
  const milestones = draft.milestones ?? [];
  if (milestone && milestones.some((entry) => entry.id === milestone.id)) return draft;
  return setMilestones(draft, [...milestones, milestone ?? newMilestone(nextId(milestones.map((entry) => entry.id), "milestone"))]);
};

export const updateMilestone = (draft: StoryDraft, id: string, patch: Partial<Omit<Milestone, "id">>): StoryDraft =>
  setMilestones(draft, (draft.milestones ?? []).map((milestone) => (milestone.id === id ? { ...milestone, ...patch } : milestone)));

export const removeMilestone = (draft: StoryDraft, id: string): StoryDraft => setMilestones(draft, (draft.milestones ?? []).filter((milestone) => milestone.id !== id));

export const newWidget = (id: string): StoryWidget => ({ id, kind: "log", title: "Log", audience: "player" });

export const setWidgets = (draft: StoryDraft, widgets: StoryWidget[]): StoryDraft => withList(draft, "widgets", widgets);

export const addWidget = (draft: StoryDraft, widget?: StoryWidget): StoryDraft => {
  const widgets = draft.widgets ?? [];
  if (widget && widgets.some((entry) => entry.id === widget.id)) return draft;
  return setWidgets(draft, [...widgets, widget ?? newWidget(nextId(widgets.map((entry) => entry.id), "widget"))]);
};

export const updateWidget = (draft: StoryDraft, id: string, patch: Partial<Omit<StoryWidget, "id">>): StoryDraft =>
  setWidgets(draft, (draft.widgets ?? []).map((widget) => (widget.id === id ? { ...widget, ...patch } : widget)));

export const removeWidget = (draft: StoryDraft, id: string): StoryDraft => setWidgets(draft, (draft.widgets ?? []).filter((widget) => widget.id !== id));

const without = <T extends object, K extends keyof T>(value: T, key: K): T => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};

export const setQualityDisplay = (draft: StoryDraft, key: string, display: QualityDisplay | undefined): StoryDraft => (display
  ? updateQuality(draft, key, { display })
  : { ...draft, qualities: draft.qualities.map((quality) => (quality.key === key ? without(quality, "display") : quality)) });

export const setCheckpointChecks = (draft: StoryDraft, id: string, checks: StoryCheck[]): StoryDraft => (checks.length
  ? updateCheckpoint(draft, id, { checks })
  : { ...draft, checkpoints: draft.checkpoints.map((checkpoint) => (checkpoint.id === id ? without(checkpoint, "checks") : checkpoint)) });

export const setTransitionCheck = (draft: StoryDraft, index: number, check: StoryCheck | undefined): StoryDraft => (check
  ? updateTransition(draft, index, { check })
  : { ...draft, transitions: draft.transitions.map((transition, at) => (at === index ? without(transition, "check") : transition)) });

export const CHARACTER_LIFE_FIELDS = ["relationships", "mood", "agenda", "schedule", "factions"] as const;

export type CharacterLife = Pick<RosterMember, (typeof CHARACTER_LIFE_FIELDS)[number]>;

export const setCharacterLife = (draft: StoryDraft, id: string, life: CharacterLife): StoryDraft => ({
  ...draft,
  roster: draft.roster.map((member) => {
    if (member.id !== id) return member;
    const rest: RosterMember = { ...member };
    CHARACTER_LIFE_FIELDS.forEach((field) => { delete rest[field]; });
    const kept = Object.fromEntries(CHARACTER_LIFE_FIELDS.flatMap((field) => {
      const value = life[field];
      return value === undefined || (Array.isArray(value) && !value.length) ? [] : [[field, value]];
    }));
    return { ...rest, ...kept };
  }),
});

type RelationshipLabels = Pick<RelationshipDecl, "public" | "secret">;

const withLabels = (relationship: RelationshipDecl, labels: RelationshipLabels): RelationshipDecl => {
  const rest: RelationshipDecl = { ...relationship };
  delete rest.public;
  delete rest.secret;
  return { ...rest, ...(labels.public?.length ? { public: labels.public } : {}), ...(labels.secret?.length ? { secret: labels.secret } : {}) };
};

export const setRelationshipLabels = (draft: StoryDraft, id: string, toward: string, labels: RelationshipLabels): StoryDraft => ({
  ...draft,
  roster: draft.roster.map((member) => (member.id !== id ? member : {
    ...member, relationships: (member.relationships ?? []).map((relationship) => (relationship.toward === toward ? withLabels(relationship, labels) : relationship)),
  })),
});

export const newFaction = (id: string): Faction => ({
  id, name: id, range: [-5, 5], start: 0, bands: [{ max: -2, label: "Hostile" }, { max: 1, label: "Neutral" }, { label: "Trusted" }], moves: [],
});

export const setFactions = (draft: StoryDraft, factions: Faction[]): StoryDraft => {
  const ids = new Set(factions.map((faction) => faction.id));
  const roster = draft.roster.map((member) => {
    if (!member.factions) return member;
    const kept = member.factions.filter((id) => ids.has(id));
    if (kept.length === member.factions.length) return member;
    const rest: RosterMember = { ...member };
    delete rest.factions;
    return kept.length ? { ...rest, factions: kept } : rest;
  });
  return withList({ ...draft, roster }, "factions", factions);
};

export const addFaction = (draft: StoryDraft, faction?: Faction): StoryDraft => {
  const ids = new Set((draft.factions ?? []).map((entry) => entry.id));
  const id = ids.has("faction") ? `faction-${Array.from({ length: ids.size + 1 }, (_, at) => at + 2).find((at) => !ids.has(`faction-${at}`))}` : "faction";
  return setFactions(draft, [...(draft.factions ?? []), faction ?? newFaction(id)]);
};

export const updateFaction = (draft: StoryDraft, id: string, patch: Partial<Omit<Faction, "id">>): StoryDraft =>
  setFactions(draft, (draft.factions ?? []).map((faction) => (faction.id === id ? { ...faction, ...patch } : faction)));

export const removeFaction = (draft: StoryDraft, id: string): StoryDraft => setFactions(draft, (draft.factions ?? []).filter((faction) => faction.id !== id));

export const setMemberFactions = (draft: StoryDraft, memberId: string, factions: string[]): StoryDraft => ({
  ...draft,
  roster: draft.roster.map((member) => {
    if (member.id !== memberId) return member;
    const rest: RosterMember = { ...member };
    delete rest.factions;
    return factions.length ? { ...rest, factions } : rest;
  }),
});

export const setClock = (draft: StoryDraft, clock: StoryClock | undefined): StoryDraft => (clock ? { ...draft, clock } : without(draft, "clock"));

export const setCodex = (draft: StoryDraft, codex: StoryCodex | undefined): StoryDraft => {
  const kept: StoryCodex = { ...(codex?.people?.length ? { people: codex.people } : {}), ...(codex?.places?.length ? { places: codex.places } : {}) };
  return kept.people || kept.places ? { ...draft, codex: kept } : without(draft, "codex");
};

export const updateCodexEntry = (draft: StoryDraft, page: CodexPage, entry: CodexEntry): StoryDraft => {
  const entries = draft.codex?.[page] ?? [];
  const next = entries.some((item) => item.id === entry.id) ? entries.map((item) => (item.id === entry.id ? entry : item)) : [...entries, entry];
  return setCodex(draft, { ...draft.codex, [page]: next });
};

export const removeCodexEntry = (draft: StoryDraft, page: CodexPage, id: string): StoryDraft =>
  setCodex(draft, { ...draft.codex, [page]: (draft.codex?.[page] ?? []).filter((item) => item.id !== id) });

export const setCodexShown = (draft: StoryDraft, shown: boolean): StoryDraft => {
  const display = { ...draft.display };
  if (shown) delete display.codex;
  else display.codex = false;
  return Object.keys(display).length ? { ...draft, display } : without(draft, "display");
};
