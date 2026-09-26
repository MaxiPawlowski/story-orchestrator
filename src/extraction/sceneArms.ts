import { buildEpistemicPassPrompt, buildLedgerPassPrompt, type LedgerPassEntity } from "@memory/contract";
import { chunkMessages } from "./chunker";
import type { FitOptions } from "./inputBudget";

export type SceneArm = "A" | "B";

export interface SceneArmMessage {
  messageId: number;
  speaker: string;
  text: string;
}

export interface SceneArmSpec {
  messages: SceneArmMessage[];
  sceneStart: number;
  detectFrom: number;
  to: number;
  participants: string[];
  entities?: LedgerPassEntity[];
}

export interface SceneArmPass {
  from: number;
  to: number;
  messageIds: number[];
  epistemicPrompt: string;
  ledgerPrompt: string;
}

const sceneText = (messages: readonly SceneArmMessage[]) => messages.map((message) => `${message.speaker}: ${message.text}`).join("\n") || "(empty)";

const windowsFor = (messages: SceneArmMessage[], arm: SceneArm, fit?: FitOptions): SceneArmMessage[][] => {
  if (arm === "A" || !fit) return [messages];
  const plan = chunkMessages(messages, fit);
  return plan.ok ? plan.windows.map((window) => window.messages) : [messages];
};

export function sceneArmPasses(spec: SceneArmSpec, arm: SceneArm, fit?: FitOptions): SceneArmPass[] {
  const from = arm === "A" ? spec.detectFrom : spec.sceneStart;
  const inRange = spec.messages.filter((message) => message.messageId >= from && message.messageId <= spec.to);
  return windowsFor(inRange, arm, fit).filter((window) => window.length).map((window) => ({
    from: window[0].messageId,
    to: window[window.length - 1].messageId,
    messageIds: window.map((message) => message.messageId),
    epistemicPrompt: buildEpistemicPassPrompt(sceneText(window), spec.participants),
    ledgerPrompt: buildLedgerPassPrompt(sceneText(window), spec.entities ?? []),
  }));
}
