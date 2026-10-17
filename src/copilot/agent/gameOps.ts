import { CODEX_PAGES, type CodexEntry, type CodexPage, type Faction, type Milestone, type QualityDisplay, type Quest, type StoryCheck, type StoryV2, type StoryWidget,
  type ValidationError } from "@engine/index";
import { addCodexQualities, checkCodex, readCodex } from "@engine/validate/codex";
import { checkFactions, factionQualities, readFactions } from "@engine/validate/factions";
import { readCheck, readChecks } from "@engine/validate/checks";
import { readDisplay } from "@engine/validate/display";
import { readMilestones, readQuests } from "@engine/validate/quests";
import { readWidgets } from "@engine/validate/widgets";
import { readLife } from "@engine/validate/life";
import { checkRumors, readRumors } from "@engine/validate/rumors";
import type { Rumor } from "@engine/rumorSchema";
import type { CalendarInput, StoryClock } from "@engine/lifeSchema";
import { isRecord } from "@utils/guards";
import {
  CHARACTER_LIFE_FIELDS, removeCodexEntry, setCalendar, setCharacterLife, setClock, setFactions, setMemberGossip, setRumors, updateCodexEntry,
  setMilestones, setQualityDisplay, setQuests, setCheckpointChecks, setTransitionCheck, setWidgets, type CharacterLife,
} from "../../studio/gameMutations";
import type { OpDescription } from "../index";

export type GameAgentOp =
  | { kind: "setQuests"; quests: Quest[] }
  | { kind: "setMilestones"; milestones: Milestone[] }
  | { kind: "setWidgets"; widgets: StoryWidget[] }
  | { kind: "setQualityDisplay"; key: string; display: QualityDisplay | null }
  | { kind: "setCheckpointChecks"; id: string; checks: StoryCheck[] }
  | { kind: "setTransitionCheck"; index: number; check: StoryCheck | null }
  | { kind: "setCharacterLife"; id: string; life: CharacterLife }
  | { kind: "setClock"; clock: StoryClock | null }
  | { kind: "setCalendar"; calendar: CalendarInput | null }
  | { kind: "setCodexEntry"; page: CodexPage; entry: CodexEntry }
  | { kind: "removeCodexEntry"; page: CodexPage; id: string }
  | { kind: "setFactions"; factions: Faction[] }
  | { kind: "setRumors"; rumors: Rumor[]; gossip: Record<string, Record<string, unknown> | null> };

export const GAME_AGENT_KINDS: ReadonlySet<string> = new Set<GameAgentOp["kind"]>([
  "setQuests", "setMilestones", "setWidgets", "setQualityDisplay", "setCheckpointChecks", "setTransitionCheck", "setCharacterLife", "setClock", "setCodexEntry", "removeCodexEntry",
  "setFactions", "setCalendar", "setRumors",
]);

const refused = (tool: string, errors: ValidationError[]) => ({ ok: false as const, message: errors.map((error) => `${tool}.${error.path}: ${error.message}`).join("; ") });

const clockOf = (value: Record<string, unknown>): StoryClock => ({ ...value, times: Array.isArray(value.times) ? value.times.map(String) : [] });

export type GameCallCheck = { ok: true; op: GameAgentOp } | { ok: false; message: string };

const readCodexCall = (tool: string, args: Record<string, unknown>): GameCallCheck => {
  const page = String(args.page).trim() as CodexPage;
  if (!(CODEX_PAGES as readonly string[]).includes(page)) return { ok: false, message: `${tool}.page: people or places` };
  if (tool === "removeCodexEntry") return { ok: true, op: { kind: "removeCodexEntry", page, id: String(args.id).trim() } };
  const errors: ValidationError[] = [];
  const entry = readCodex({ [page]: [args.entry] }, errors)?.[page]?.[0];
  return errors.length || !entry ? refused(tool, errors) : { ok: true, op: { kind: "setCodexEntry", page, entry } };
};

export const readGameCall = (tool: string, args: Record<string, unknown>): GameCallCheck => {
  const errors: ValidationError[] = [];
  if (tool === "setQuests") {
    const quests = readQuests(args.quests, errors) ?? [];
    return errors.length ? refused(tool, errors) : { ok: true, op: { kind: "setQuests", quests } };
  }
  if (tool === "setMilestones") {
    const milestones = readMilestones(args.milestones, errors) ?? [];
    return errors.length ? refused(tool, errors) : { ok: true, op: { kind: "setMilestones", milestones } };
  }
  if (tool === "setWidgets") return { ok: true, op: { kind: "setWidgets", widgets: (Array.isArray(args.widgets) ? args.widgets : []) as StoryWidget[] } };
  if (tool === "setQualityDisplay") {
    return { ok: true, op: { kind: "setQualityDisplay", key: String(args.key).trim(), display: isRecord(args.display) ? (args.display as Partial<QualityDisplay> as QualityDisplay) : null } };
  }
  if (tool === "setCharacterLife") {
    const life = isRecord(args.life) ? args.life : {};
    const unknown = Object.keys(life).filter((key) => !(CHARACTER_LIFE_FIELDS as readonly string[]).includes(key));
    if (unknown.length) return { ok: false, message: `setCharacterLife.life: unknown field ${unknown.join(", ")}; the fields are ${CHARACTER_LIFE_FIELDS.join(", ")}` };
    return { ok: true, op: { kind: "setCharacterLife", id: String(args.id).trim(), life: life as CharacterLife } };
  }
  if (tool === "setCodexEntry" || tool === "removeCodexEntry") return readCodexCall(tool, args);
  if (tool === "setClock") return { ok: true, op: { kind: "setClock", clock: isRecord(args.clock) ? clockOf(args.clock) : null } };
  if (tool === "setCalendar") return { ok: true, op: { kind: "setCalendar", calendar: isRecord(args.calendar) ? args.calendar as CalendarInput : null } };
  if (tool === "setFactions") {
    const factions = readFactions(args.factions, errors) ?? [];
    return errors.length ? refused(tool, errors) : { ok: true, op: { kind: "setFactions", factions } };
  }
  if (tool === "setRumors") {
    const gossip = isRecord(args.gossip) ? args.gossip : {};
    const roster = Object.entries(gossip).filter(([, channel]) => channel !== null).map(([id, channel]) => ({ id, gossip: channel }));
    const parsed = readRumors({ rumors: args.rumors ?? [], roster }, errors);
    const channels = Object.fromEntries(Object.entries(gossip).map(([id, channel]) => [id, isRecord(channel) ? channel : null]));
    return errors.length ? refused(tool, errors) : { ok: true, op: { kind: "setRumors", rumors: parsed?.rumors ?? [], gossip: channels } };
  }
  if (tool === "setCheckpointChecks") {
    const checks = readChecks(args.checks, "checks", errors);
    return errors.length ? refused(tool, errors) : { ok: true, op: { kind: "setCheckpointChecks", id: String(args.id).trim(), checks } };
  }
  const check = args.check === null || args.check === undefined ? null : readCheck(args.check, "check", errors);
  return errors.length ? refused(tool, errors) : { ok: true, op: { kind: "setTransitionCheck", index: Number(args.index), check } };
};

export const applyGameOp = (draft: StoryV2, op: GameAgentOp): StoryV2 => {
  switch (op.kind) {
    case "setQuests": return setQuests(draft, op.quests);
    case "setMilestones": return setMilestones(draft, op.milestones);
    case "setWidgets": return setWidgets(draft, op.widgets);
    case "setQualityDisplay": return setQualityDisplay(draft, op.key, op.display ?? undefined);
    case "setCheckpointChecks": return setCheckpointChecks(draft, op.id, op.checks);
    case "setTransitionCheck": return setTransitionCheck(draft, op.index, op.check ?? undefined);
    case "setCharacterLife": return setCharacterLife(draft, op.id, op.life);
    case "setClock": return setClock(draft, op.clock ?? undefined);
    case "setCalendar": return setCalendar(draft, op.calendar ?? undefined);
    case "setCodexEntry": return updateCodexEntry(draft, op.page, op.entry);
    case "removeCodexEntry": return removeCodexEntry(draft, op.page, op.id);
    case "setFactions": return setFactions(draft, op.factions);
    case "setRumors": return Object.entries(op.gossip).reduce((next, [id, channel]) => setMemberGossip(next, id, channel ?? undefined), setRumors(draft, op.rumors));
  }
};

export const describeGameOp = (op: GameAgentOp): OpDescription => {
  switch (op.kind) {
    case "setQuests": return { action: "update", entity: "story.quests", label: op.quests.length ? `Quests: ${op.quests.map((quest) => quest.title).join(" / ")}` : "Remove every quest" };
    case "setMilestones": return { action: "update", entity: "story.milestones", label: op.milestones.length ? `${op.milestones.length} milestone(s)` : "Remove every milestone" };
    case "setWidgets": return { action: "update", entity: "story.widgets", label: op.widgets.length ? `Panels: ${op.widgets.map((widget) => widget.title).join(" / ")}` : "Remove every panel" };
    case "setQualityDisplay": return { action: "update", entity: `qualities.${op.key}.display`, label: op.display ? `Show ${op.key} as ${op.display.label}` : `Hide ${op.key} from players` };
    case "setCheckpointChecks": return { action: "update", entity: `checkpoints.${op.id}.checks`, label: `${op.checks.length} check(s) at ${op.id}` };
    case "setTransitionCheck": {
      const label = op.check ? `Check ${op.check.id} on transition ${op.index}` : `Remove the check on transition ${op.index}`;
      return { action: "update", entity: `transitions.${op.index}.check`, label };
    }
    case "setCharacterLife": {
      const parts = CHARACTER_LIFE_FIELDS.filter((field) => op.life[field] !== undefined);
      return { action: "update", entity: `roster.${op.id}`, label: parts.length ? `${op.id}: ${parts.join(", ")}` : `Clear ${op.id}'s character life` };
    }
    case "setClock": return { action: "update", entity: "story.clock", label: op.clock ? `Clock: ${op.clock.times.join(" / ")}` : "Remove the story clock" };
    case "setCalendar": {
      const label = op.calendar ? `Calendar: ${(op.calendar.months ?? []).map((month) => month.name).join(" / ")}` : "Remove the calendar";
      return { action: "update", entity: "story.calendar", label };
    }
    case "setCodexEntry": {
      const label = `${op.page === "people" ? "Person" : "Place"} page ${op.entry.name ?? op.entry.member ?? op.entry.id}: ${op.entry.facts.length} fact(s)`;
      return { action: "update", entity: `codex.${op.page}.${op.entry.id}`, label };
    }
    case "removeCodexEntry": return { action: "remove", entity: `codex.${op.page}.${op.id}`, label: `Remove the ${op.page === "people" ? "person" : "place"} page ${op.id}` };
    case "setFactions": {
      const label = op.factions.length ? `Factions: ${op.factions.map((faction) => faction.name).join(" / ")}` : "Remove every faction";
      return { action: "update", entity: "story.factions", label };
    }
    case "setRumors": {
      const channels = Object.keys(op.gossip).length;
      const label = op.rumors.length ? `Rumors: ${op.rumors.map((rumor) => rumor.id).join(" / ")}${channels ? `; gossip for ${channels} member(s)` : ""}` : "Remove every rumor";
      return { action: "update", entity: "story.rumors", label };
    }
  }
};

const factionProblems = (draft: StoryV2, errors: ValidationError[]) => {
  const byKey = Object.fromEntries([...draft.qualities, ...factionQualities(draft.factions ?? [], draft.roster)].map((quality) => [quality.key, quality]));
  checkFactions({ factions: draft.factions, roster: draft.roster, qualityByKey: byKey, quests: draft.quests }, errors);
};

export const gameOpProblem = (draft: StoryV2, op: GameAgentOp): string | null => {
  const errors: ValidationError[] = [];
  const byKey = Object.fromEntries(draft.qualities.map((quality) => [quality.key, quality]));
  if (op.kind === "setWidgets") readWidgets(op.widgets, {
    qualityByKey: byKey, qualities: draft.qualities, checkpointIds: new Set(draft.checkpoints.map((checkpoint) => checkpoint.id)), checkpoints: draft.checkpoints, transitions: draft.transitions,
    roster: draft.roster, factions: draft.factions,
  }, errors);
  if (op.kind === "setQualityDisplay") {
    const quality = byKey[op.key];
    if (!quality) return `'${op.key}' is not a quality`;
    if (op.display) readDisplay(op.display, quality, "display", errors);
  }
  if (op.kind === "setCharacterLife") {
    if (!draft.roster.some((member) => member.id === op.id)) return `'${op.id}' is not a cast member`;
    const roster = draft.roster.map((member) => (member.id === op.id ? { ...member, ...op.life } : member));
    readLife({ roster: roster.map((member) => ({ ...member })), clock: draft.clock }, errors);
  }
  if (op.kind === "setClock" && op.clock) readLife({ roster: [], clock: op.clock }, errors);
  if (op.kind === "setCalendar" && op.calendar) readLife({ roster: [], clock: draft.clock, calendar: op.calendar }, errors);
  if (op.kind === "setCodexEntry") {
    const codex = updateCodexEntry(draft, op.page, op.entry).codex;
    const qualities = addCodexQualities(draft.qualities, codex, errors);
    const checkpointById = Object.fromEntries(draft.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
    checkCodex(codex, { checkpointById, qualityByKey: Object.fromEntries(qualities.map((quality) => [quality.key, quality])), roster: draft.roster }, errors);
  }
  if (op.kind === "removeCodexEntry" && !(draft.codex?.[op.page] ?? []).some((entry) => entry.id === op.id)) return `'${op.id}' is not on the ${op.page} page`;
  if (op.kind === "setFactions" || (op.kind === "setCharacterLife" && op.life.factions !== undefined)) factionProblems(applyGameOp(draft, op), errors);
  if (op.kind === "setRumors") {
    const next = applyGameOp(draft, op);
    const life = readLife({ roster: next.roster.map((member) => ({ ...member })), clock: next.clock }, []);
    checkRumors(readRumors({ ...next }, errors), { roster: next.roster, qualityByKey: byKey, hasClock: Boolean(next.clock), life }, errors);
  }
  if (op.kind === "setCheckpointChecks" && !draft.checkpoints.some((checkpoint) => checkpoint.id === op.id)) return `'${op.id}' is not a checkpoint`;
  if (op.kind === "setTransitionCheck" && !draft.transitions[op.index]) return `transition ${op.index} does not exist (readGraph numbers them)`;
  return errors.length ? errors.map((error) => `${error.path}: ${error.message}`).join("; ") : null;
};
