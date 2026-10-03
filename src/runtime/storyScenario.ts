import type { Checkpoint, NormalizedStoryV2 } from "@engine/index";
import type { WriteResult } from "@utils/writeResult";
import type { EffectExtension, EffectExtensionInput, EffectExtensionPlan } from "./effectExtensions";
import type { EffectLedgerRow } from "./types";

export const SCENARIO_EFFECT = "scenario";

export interface ScenarioCard {
  name: string;
  scenario: string;
}

export interface ScenarioHost {
  read: () => { chatId: string; text: string } | null;
  write: (chatId: string, text: string) => WriteResult<object>;
  cast: () => ScenarioCard[];
}

export interface ScenarioFrame {
  override: string;
  cast: ScenarioCard[];
}

const authored = (checkpoint: Checkpoint | undefined): string | null => {
  const scenario = checkpoint?.effects?.scenario;
  if (scenario === undefined) return null;
  return typeof scenario === "string" ? scenario.trim() : "";
};

export function scenarioForPath(story: NormalizedStoryV2, path: string[]): string | null {
  return path.reduce<string | null>((text, id) => authored(story.checkpointById[id]) ?? text, null);
}

export const storySetsScenario = (story: NormalizedStoryV2): boolean => story.checkpoints.some((checkpoint) => authored(checkpoint) !== null);

const scenarioRows = (ledger: EffectLedgerRow[]) =>
  ledger.filter((row) => row.target.kind === "extension" && row.target.name === SCENARIO_EFFECT);

const rowText = (value: Record<string, unknown> | null | undefined): string | null => (typeof value?.text === "string" ? value.text : null);

export function lastOwnScenario(ledger: EffectLedgerRow[]): string | null {
  const applied = scenarioRows(ledger).filter((row) => row.status === "applied");
  return applied.length ? rowText(applied[applied.length - 1].after) : null;
}

const alreadyRefused = (ledger: EffectLedgerRow[], desired: string, held: string): boolean => {
  const newest = scenarioRows(ledger).at(-1);
  return newest?.status === "externally-changed" && rowText(newest.after) === desired && rowText(newest.found) === held;
};

export function competingCards(story: NormalizedStoryV2, override: string, cast: ScenarioCard[]): string[] {
  if (storySetsScenario(story) || override.trim()) return [];
  return cast.filter((entry) => entry.scenario.trim()).map((entry) => entry.name);
}

export const competingSummary = (names: string[]): string => `${names.length} character card scenario(s) frame this chat and the story sets none`;

const competingNotes = (input: EffectExtensionInput, override: string, host: ScenarioHost) => {
  if (input.mode !== "activate") return [];
  const names = competingCards(input.story, override, host.cast());
  if (!names.length) return [];
  return [{ summary: competingSummary(names), detail: names.join(", ") }];
};

export function planScenario(input: EffectExtensionInput, host: ScenarioHost): EffectExtensionPlan {
  const open = host.read();
  if (!open) return { step: null, notes: [] };
  const notes = competingNotes(input, open.text, host);
  const desired = scenarioForPath(input.story, input.path);
  if (desired === null || open.text === desired) return { step: null, notes };
  const clobbers = open.text !== "" && open.text !== lastOwnScenario(input.ledger);
  if (clobbers && alreadyRefused(input.ledger, desired, open.text)) return { step: null, notes };
  const before = { text: open.text };
  const write = async () => host.write(open.chatId, desired);
  return { step: { effect: SCENARIO_EFFECT, before, after: { text: desired }, write, ...(clobbers ? { found: before } : {}) }, notes };
}

export function createScenarioExtension(host: ScenarioHost): EffectExtension {
  return {
    name: SCENARIO_EFFECT,
    plan: (input) => planScenario(input, host),
    read: () => {
      const open = host.read();
      return open ? { text: open.text } : null;
    },
    restore: async (before) => {
      const open = host.read();
      const text = rowText(before);
      return Boolean(open) && text !== null && host.write(open?.chatId ?? "", text).ok;
    },
  };
}

let readFrame: () => ScenarioFrame | null = () => null;

export const readScenarioFrameWith = (read: () => ScenarioFrame | null): (() => void) => {
  readFrame = read;
  return () => {
    if (readFrame === read) readFrame = () => null;
  };
};

export const scenarioFrame = (): ScenarioFrame | null => readFrame();

export const competingScenarios = (story: NormalizedStoryV2 | null, frame: ScenarioFrame | null): string[] =>
  story && frame ? competingCards(story, frame.override, frame.cast) : [];
