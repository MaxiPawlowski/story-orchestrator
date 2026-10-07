import type { RuntimeSnapshot } from "./types";
import { SILENT_REPLY_WINDOW } from "./thinkingSilence";
import { DEGRADING_SETUP_CHECKS, IMAGE_CHECKS, INFO_SETUP_CHECKS, MODEL_CHECKS, REQUIREMENT_CHECKS } from "./checksSetup";
import { PERSONA_BLOCK_CHECKS, PERSONA_DEGRADE_CHECKS, PERSONA_INFO_CHECKS } from "./checksPersona";
import { GAME_CHECKS } from "./checksGame";
import { SPRITE_DEGRADE_CHECKS, SPRITE_INFO_CHECKS } from "./checksSprites";

export type RepairArea = "memory-model" | "model-role" | "cast" | "lore" | "persona" | "save" | "chapter" | "privacy" | "thinking" | "group" | "image" | "quest" | "characters";

export type CheckScope = "install" | "chat" | "story";
export type CheckAudience = "player" | "author";
export type CheckSeverity = "blocks" | "degrades" | "info";

export interface RepairAction {
  kind: "add-members" | "unmute-members" | "remove-personas";
  members: string[];
  label: string;
}

export interface MakeGroupFix {
  kind: "make-group";
  storyId: string;
  label: string;
}

export type PersonaFix = { kind: "switch-persona"; avatarId: string; label: string } | { kind: "open-player-setup"; label: string };

export type OneClickFix = RepairAction | MakeGroupFix | PersonaFix;

export type ShowMe = { kind: "setting"; id: string } | { kind: "group-members" } | { kind: "st-extensions" };

export interface CheckFinding {
  consequence: string;
  detail: string;
  /** Player words; null when this finding is for the author only, even on a player-audience check. */
  player?: string | null;
  action?: OneClickFix;
  target?: ShowMe;
  provisionable?: boolean;
}

export interface Check {
  id: string;
  area: RepairArea;
  scope: CheckScope;
  audience: CheckAudience;
  severity: CheckSeverity;
  /** Runs with no loaded story: it reads the selection or the binding, never the engine. */
  engineFree?: boolean;
  /** The feature registry entry whose `needs` this check stands for. */
  feature?: string;
  applies?: (snapshot: RuntimeSnapshot) => boolean;
  detect: (snapshot: RuntimeSnapshot) => CheckFinding | null;
}

export interface CheckResult {
  check: string;
  area: RepairArea;
  severity: CheckSeverity;
  consequence: string;
  detail: string;
  targetId: string | null;
  target: ShowMe | null;
  provisionable: boolean;
  player: string | null;
  action: OneClickFix | null;
  opensGroup: boolean;
  dismissable: boolean;
}

const them = (names: string[], one: string, many: string) => (names.length === 1 ? one : many);

const COPIER_SWITCHES: Readonly<Record<string, string>> = {
  Summarize: "Summarize: pause it, or set its update interval to 0",
  "Vector Storage": "Vector Storage: untick \"Enabled for chat messages\"",
};

export const SECRET_LEAK_CHECK: Check = {
  id: "transcript-copiers",
  area: "privacy",
  scope: "story",
  audience: "player",
  severity: "degrades",
  feature: "private-knowledge",
  detect: (snapshot) => {
    const leaks = snapshot.secretLeaks ?? [];
    if (!leaks.length) return null;
    const switches = leaks.map((name) => COPIER_SWITCHES[name] ?? name).join("; ");
    return {
      consequence: "A character can learn what was kept from them: another extension puts the whole chat, secrets included, into every character's prompt.",
      detail: `On: ${leaks.join(", ")}. Story Orchestrator keeps private knowledge out of its own blocks but cannot filter these. `
        + `${snapshot.secretsHeld ? "A secret is held right now, so it can already reach a character it was kept from. " : "No secret is held yet; the first one would reach every character. "}`
        + `Switch ${them(leaks, "it", "them")} off while this story plays to keep secrets (${switches}).`,
      player: `${leaks.join(" and ")} ${them(leaks, "shares", "share")} the whole chat with every character, so a character can learn what was kept from them. `
        + `Switch ${them(leaks, "it", "them")} off in SillyTavern's extensions to keep secrets.`,
    };
  },
};

export const THINKING_TARGET_ID = "so-inner-harvest";

export const THINKING_PLAYER_TEXT = "Characters' private intentions are not being tracked, because the model is not thinking before it replies. "
  + "Turn on reasoning (thinking) in your model's settings to play this as intended.";

export const THINKING_CHECK: Check = {
  id: "model-not-thinking",
  area: "thinking",
  scope: "chat",
  audience: "player",
  severity: "degrades",
  feature: "inner-voice",
  detect: (snapshot) => (snapshot.thinkingSilent ? {
    consequence: "Characters' reasoning is read for what they intend, but the model is not thinking before it replies, so there is nothing to read.",
    detail: `The last ${SILENT_REPLY_WINDOW} replies in this chat carry no reasoning. The prompt may close the thought before the model starts (a preset or instruct `
      + "template that prefills an empty thought), or the model does not think. Turn reasoning on for this connection, or switch off \"Read characters' reasoning\" under Inner voice.",
    player: THINKING_PLAYER_TEXT,
    target: snapshot.ui?.authorView ? { kind: "setting", id: THINKING_TARGET_ID } : undefined,
  } : null),
};

export const STORY_NEEDS_GROUP_PLAYER = "Stories play in group chats. Make a group for this story, or open one that plays it.";

export const STORY_NEEDS_GROUP_CHECK: Check = {
  id: "story-needs-group",
  area: "group",
  scope: "chat",
  audience: "player",
  severity: "blocks",
  engineFree: true,
  feature: "stories",
  detect: (snapshot) => {
    const view = snapshot.noGroup;
    if (!view) return null;
    return {
      consequence: "This story does not play here: stories play in group chats, and this is a one-on-one chat.",
      detail: `${view.storyTitle ? `"${view.storyTitle}"` : `The story "${view.storyId}"`} is selected in a one-on-one chat, so nothing runs: `
        + "no reads, no memory, no effects. Make a group with the story's cast, or open a group that plays it.",
      player: STORY_NEEDS_GROUP_PLAYER,
      ...(view.storyId ? { action: { kind: "make-group" as const, storyId: view.storyId, label: "Make a group for this story" } } : {}),
    };
  },
};

export const CHECKS: readonly Check[] = [
  ...MODEL_CHECKS, STORY_NEEDS_GROUP_CHECK, ...REQUIREMENT_CHECKS, ...PERSONA_BLOCK_CHECKS,
  SECRET_LEAK_CHECK, THINKING_CHECK, ...PERSONA_DEGRADE_CHECKS, ...DEGRADING_SETUP_CHECKS, ...IMAGE_CHECKS, ...SPRITE_DEGRADE_CHECKS, ...GAME_CHECKS,
  ...INFO_SETUP_CHECKS, ...SPRITE_INFO_CHECKS, ...PERSONA_INFO_CHECKS,
];

const inScope = (check: Check, snapshot: RuntimeSnapshot): boolean => check.scope === "install" || Boolean(check.engineFree) || Boolean(snapshot.storyId);

const settingId = (target: ShowMe | undefined): string | null => (target?.kind === "setting" ? target.id : null);

export function runCheck(check: Check, snapshot: RuntimeSnapshot): CheckResult | null {
  if (!inScope(check, snapshot) || (check.applies && !check.applies(snapshot))) return null;
  const finding = check.detect(snapshot);
  if (!finding) return null;
  return {
    check: check.id, area: check.area, severity: check.severity, consequence: finding.consequence, detail: finding.detail,
    targetId: settingId(finding.target), target: finding.target ?? null, provisionable: finding.provisionable ?? false,
    player: check.audience === "player" ? (finding.player === undefined ? finding.consequence : finding.player) : null,
    action: finding.action ?? null, opensGroup: finding.target?.kind === "group-members", dismissable: check.severity !== "blocks",
  };
}

export function runChecks(snapshot: RuntimeSnapshot, severity: CheckSeverity, checks: readonly Check[] = CHECKS): CheckResult[] {
  return checks.filter((check) => check.severity === severity).map((check) => runCheck(check, snapshot)).filter((result): result is CheckResult => result !== null);
}

export const withDismissal = (dismissed: readonly string[], check: string, on: boolean): string[] =>
  on ? [...new Set([...dismissed, check])] : dismissed.filter((id) => id !== check);

export const isDismissed = (result: Pick<CheckResult, "check" | "dismissable">, dismissed: readonly string[] | undefined): boolean =>
  result.dismissable && Boolean(dismissed?.includes(result.check));
