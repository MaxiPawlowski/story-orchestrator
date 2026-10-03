import type { RuntimeSnapshot } from "./types";
import { SILENT_REPLY_WINDOW } from "./thinkingSilence";

export type RepairArea = "memory-model" | "model-role" | "cast" | "lore" | "persona" | "save" | "chapter" | "privacy" | "thinking";

export type CheckScope = "install" | "chat" | "story";
export type CheckAudience = "player" | "author";
export type CheckSeverity = "blocks" | "degrades";

export interface CheckFinding {
  consequence: string;
  detail: string;
  player?: string;
  targetId?: string | null;
}

export interface Check {
  id: string;
  area: RepairArea;
  scope: CheckScope;
  audience: CheckAudience;
  severity: CheckSeverity;
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
  provisionable: false;
  player: string | null;
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
  detect: (snapshot) => {
    const leaks = snapshot.secretLeaks ?? [];
    if (!leaks.length) return null;
    const switches = leaks.map((name) => COPIER_SWITCHES[name] ?? name).join("; ");
    return {
      consequence: "A character can learn what was kept from them: another extension puts the whole chat, secrets included, into every character's prompt.",
      detail: `On: ${leaks.join(", ")}. Story Orchestrator keeps private knowledge out of its own blocks but cannot filter these. `
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
  detect: (snapshot) => (snapshot.thinkingSilent ? {
    consequence: "Characters' reasoning is read for what they intend, but the model is not thinking before it replies, so there is nothing to read.",
    detail: `The last ${SILENT_REPLY_WINDOW} replies in this chat carry no reasoning. The prompt may close the thought before the model starts (a preset or instruct `
      + "template that prefills an empty thought), or the model does not think. Turn reasoning on for this connection, or switch off \"Read characters' reasoning\" under Inner voice.",
    player: THINKING_PLAYER_TEXT,
    targetId: snapshot.ui?.authorView ? THINKING_TARGET_ID : null,
  } : null),
};

export const CHECKS: readonly Check[] = [SECRET_LEAK_CHECK, THINKING_CHECK];

const inScope = (check: Check, snapshot: RuntimeSnapshot): boolean => check.scope === "install" || Boolean(snapshot.storyId);

export function runCheck(check: Check, snapshot: RuntimeSnapshot): CheckResult | null {
  if (!inScope(check, snapshot) || (check.applies && !check.applies(snapshot))) return null;
  const finding = check.detect(snapshot);
  if (!finding) return null;
  return {
    check: check.id, area: check.area, severity: check.severity, consequence: finding.consequence, detail: finding.detail,
    targetId: finding.targetId ?? null, provisionable: false, player: check.audience === "player" ? finding.player ?? finding.consequence : null,
  };
}

export function runChecks(snapshot: RuntimeSnapshot, severity: CheckSeverity, checks: readonly Check[] = CHECKS): CheckResult[] {
  return checks.filter((check) => check.severity === severity).map((check) => runCheck(check, snapshot)).filter((result): result is CheckResult => result !== null);
}
