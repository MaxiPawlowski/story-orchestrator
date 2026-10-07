import type { Milestone, QualityDisplay, Quest, StoryCheck, StoryV2, StoryWidget, ValidationError } from "@engine/index";
import { readCheck, readChecks } from "@engine/validate/checks";
import { readDisplay } from "@engine/validate/display";
import { readMilestones, readQuests } from "@engine/validate/quests";
import { readWidgets } from "@engine/validate/widgets";
import { isRecord } from "@utils/guards";
import { setMilestones, setQualityDisplay, setQuests, setCheckpointChecks, setTransitionCheck, setWidgets } from "../../studio/gameMutations";
import type { OpDescription } from "../index";

export type GameAgentOp =
  | { kind: "setQuests"; quests: Quest[] }
  | { kind: "setMilestones"; milestones: Milestone[] }
  | { kind: "setWidgets"; widgets: StoryWidget[] }
  | { kind: "setQualityDisplay"; key: string; display: QualityDisplay | null }
  | { kind: "setCheckpointChecks"; id: string; checks: StoryCheck[] }
  | { kind: "setTransitionCheck"; index: number; check: StoryCheck | null };

export const GAME_AGENT_KINDS: ReadonlySet<string> = new Set<GameAgentOp["kind"]>([
  "setQuests", "setMilestones", "setWidgets", "setQualityDisplay", "setCheckpointChecks", "setTransitionCheck",
]);

const refused = (tool: string, errors: ValidationError[]) => ({ ok: false as const, message: errors.map((error) => `${tool}.${error.path}: ${error.message}`).join("; ") });

export type GameCallCheck = { ok: true; op: GameAgentOp } | { ok: false; message: string };

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
    return { ok: true, op: { kind: "setQualityDisplay", key: String(args.key).trim(), display: isRecord(args.display) ? args.display as unknown as QualityDisplay : null } };
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
  }
};

export const gameOpProblem = (draft: StoryV2, op: GameAgentOp): string | null => {
  const errors: ValidationError[] = [];
  const byKey = Object.fromEntries(draft.qualities.map((quality) => [quality.key, quality]));
  if (op.kind === "setWidgets") readWidgets(op.widgets, byKey, draft.qualities, errors);
  if (op.kind === "setQualityDisplay") {
    const quality = byKey[op.key];
    if (!quality) return `'${op.key}' is not a quality`;
    if (op.display) readDisplay(op.display, quality, "display", errors);
  }
  if (op.kind === "setCheckpointChecks" && !draft.checkpoints.some((checkpoint) => checkpoint.id === op.id)) return `'${op.id}' is not a checkpoint`;
  if (op.kind === "setTransitionCheck" && !draft.transitions[op.index]) return `transition ${op.index} does not exist (readGraph numbers them)`;
  return errors.length ? errors.map((error) => `${error.path}: ${error.message}`).join("; ") : null;
};
