import type { RuntimeSnapshot } from "./types";
import { CHECKS, isDismissed, runCheck, runChecks, SECRET_LEAK_CHECK, type Check, type CheckFinding, type CheckResult, type CheckSeverity, type RepairArea } from "./checks";
import { castAbsent, castMuted, castUnbound, loreAbsent, loreUnscanned, personaAbsent, personaUnselected, REPAIR_TARGET_IDS } from "./checksSetup";

export type { MakeGroupFix, OneClickFix, RepairAction, RepairArea, ShowMe } from "./checks";
export {
  provisionableMissing, REPAIR_TARGET_IDS, ROLE_CONSEQUENCES, roleProfileTargetId, STORY_LORE_TARGET_ID, WI_GATING_TARGET_ID,
} from "./checksSetup";

// The four things a person does here are Start, Continue, Repair and Author. Repair is the ordering of
// the check registry's findings: `blocks` first, then `degrades`, each in registry order (worst first),
// so the player surface, the HUD chip and the settings panel all point at the same next step. `info`
// never enters it, and a `degrades` finding the user dismissed leaves it; a `blocks` one never does.

export type RepairStep = CheckResult;

const REPAIR_SEVERITIES: readonly CheckSeverity[] = ["blocks", "degrades"];

export function repairSteps(snapshot: RuntimeSnapshot, checks: readonly Check[] = CHECKS): RepairStep[] {
  return REPAIR_SEVERITIES.flatMap((severity) => runChecks(snapshot, severity, checks)).filter((step) => !isDismissed(step, snapshot.dismissedChecks));
}

export function nextRepairStep(snapshot: RuntimeSnapshot): RepairStep | null {
  return repairSteps(snapshot)[0] ?? null;
}

export const secretLeakStep = (snapshot: RuntimeSnapshot): RepairStep | null => runCheck(SECRET_LEAK_CHECK, snapshot);

const asStep = (finding: CheckFinding | null) => (finding ? { ...finding, provisionable: finding.provisionable ?? false, opensGroup: finding.target?.kind === "group-members" } : null);

type Requirements = RuntimeSnapshot["requirements"];

export const castRepairSteps = (requirements: Requirements) => [castAbsent(requirements), castUnbound(requirements), castMuted(requirements)].map(asStep);

export const loreRepairSteps = (requirements: Requirements) => [loreAbsent(requirements), loreUnscanned(requirements)].map(asStep);

export const personaRepairSteps = (requirements: Requirements) => [personaAbsent(requirements), personaUnselected(requirements)].map(asStep);

const objectOf = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);

export function withoutPersonas(raw: unknown, names: string[]): Record<string, unknown> | null {
  const story = objectOf(raw);
  if (!story) return null;
  const requirements = objectOf(story.requirements);
  if (!requirements) return story;
  const dropped = new Set(names.map((name) => name.trim().toLowerCase()));
  const kept = (Array.isArray(requirements.personas) ? requirements.personas : []).filter((name) => typeof name !== "string" || !dropped.has(name.trim().toLowerCase()));
  const rest = Object.fromEntries(Object.entries(requirements).filter(([key]) => key !== "personas"));
  return { ...story, requirements: kept.length ? { ...rest, personas: kept } : rest };
}

export type GettingStartedId = "memory-model" | "judge" | "images";

export interface GettingStartedStep {
  id: GettingStartedId;
  title: string;
  consequence: string;
  targetId: string;
  optional: boolean;
  done: boolean;
}

export interface GettingStartedInput {
  memoryModel: boolean;
  judgeReady: boolean;
  imagesReady: boolean;
}

export const GETTING_STARTED_TARGETS: Record<GettingStartedId, string> = {
  "memory-model": REPAIR_TARGET_IDS.memoryModel,
  judge: "so-judge-key",
  images: "so-image-settings",
};

export function gettingStartedSteps(input: GettingStartedInput): GettingStartedStep[] {
  return [
    {
      id: "memory-model", title: "Pick a memory model", optional: false, done: input.memoryModel, targetId: GETTING_STARTED_TARGETS["memory-model"],
      consequence: "Without it the story cannot follow your play or remember what happened.",
    },
    {
      id: "judge", title: "Add a judge key", optional: true, done: input.judgeReady, targetId: GETTING_STARTED_TARGETS.judge,
      consequence: "Better speaker choice and memory checks. Without it, the story uses its usual path.",
    },
    {
      id: "images", title: "Connect ComfyUI for pictures", optional: true, done: input.imagesReady, targetId: GETTING_STARTED_TARGETS.images,
      consequence: "Lets stories draw scenes and characters. Without it, there are no pictures.",
    },
  ];
}

export const gettingStartedShown = (steps: readonly GettingStartedStep[], dismissed: boolean): boolean =>
  steps.some((step) => !step.optional && !step.done) || (!dismissed && steps.some((step) => !step.done));

const forViewer = (snapshot: RuntimeSnapshot, steps: RepairStep[]): RepairStep[] => (snapshot.ui?.authorView
  ? steps
  : steps.filter((step) => step.player !== null).map((step) => ({ ...step, consequence: step.player as string, detail: step.player as string })));

export function viewerRepairStep(snapshot: RuntimeSnapshot): RepairStep | null {
  return forViewer(snapshot, repairSteps(snapshot))[0] ?? null;
}

const SURFACED_ELSEWHERE: ReadonlySet<RepairArea> = new Set(["save"]);

export function setupAlert(snapshot: RuntimeSnapshot): RepairStep | null {
  const step = viewerRepairStep(snapshot);
  return step && !SURFACED_ELSEWHERE.has(step.area) ? step : null;
}

export interface SetupFindings {
  blocks: RepairStep[];
  degrades: RepairStep[];
  info: RepairStep[];
  dismissed: RepairStep[];
}

export function setupFindings(snapshot: RuntimeSnapshot, checks: readonly Check[] = CHECKS): SetupFindings {
  const dismissed = snapshot.dismissedChecks;
  const of = (severity: CheckSeverity) => forViewer(snapshot, runChecks(snapshot, severity, checks));
  const live = (steps: RepairStep[]) => steps.filter((step) => !isDismissed(step, dismissed));
  const all = [...of("blocks"), ...of("degrades"), ...of("info")];
  return {
    blocks: of("blocks"),
    degrades: live(of("degrades")),
    info: live(of("info")),
    dismissed: all.filter((step) => isDismissed(step, dismissed)),
  };
}

export interface SetupCounts {
  blocks: number;
  degrades: number;
}

export function setupCounts(snapshot: RuntimeSnapshot, checks: readonly Check[] = CHECKS): SetupCounts {
  const findings = setupFindings(snapshot, checks);
  const counted = (steps: RepairStep[]) => steps.filter((step) => !SURFACED_ELSEWHERE.has(step.area)).length;
  return { blocks: counted(findings.blocks), degrades: counted(findings.degrades) };
}

export const beforeYouStart = (snapshot: RuntimeSnapshot, checks: readonly Check[] = CHECKS): RepairStep[] => setupFindings(snapshot, checks).blocks;

export const installFindings = (snapshot: RuntimeSnapshot, checks: readonly Check[] = CHECKS): RepairStep[] => {
  const install = checks.filter((check) => check.scope === "install");
  const findings = setupFindings(snapshot, install);
  return [...findings.blocks, ...findings.degrades, ...findings.info];
};
