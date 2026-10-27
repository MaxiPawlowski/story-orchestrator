import { readsByStep, readsWorldEvidence, type NormalizedStory } from "@engine/index";
import { HEARSAY_RULE, renderMemoryContractAddendum } from "@memory/contract";
import { fnv1a, stableStringify } from "@runtime/hash";
import { STEP_READ_REMINDER } from "./stepRead";
import { PLAYER_MARK, renderQuestion, STEP_READ_HEADER } from "./question";
import type { ScopedQuality, SharedReadContract } from "./types";

export { PARTY_EVIDENCE_RULE, PLAYER_MARK, renderQuestion, runningTotalRule, STEP_READ_HEADER, WORLD_EVIDENCE_RULE } from "./question";

export const PLAYER_ONLY_REASK = "Each reading below quoted only the player's own line, marked (player). The player's line says what they mean to do; it cannot show "
  + "that the world changed. Answer again for these qualities only: write the DELTA with evidence copied word for word from a line not marked (player) that "
  + "shows it happened. If no such line shows it, output NO_DELTA.";

const readsAnyStep = (contract: Pick<SharedReadContract, "qualities">) => contract.qualities.some(({ quality }) => readsByStep(quality));

const renderType = (contract: SharedReadContract) => [
  ...(readsAnyStep(contract) ? [STEP_READ_HEADER] : []),
  ...contract.qualities.map(({ quality, hints }) => renderQuestion(quality, hints, contract.counted?.[quality.key])),
].join("\n");

export const runningTotals = (qualities: readonly ScopedQuality[], values: Readonly<Record<string, unknown>>): Record<string, number> =>
  Object.fromEntries(qualities.filter(({ quality }) => quality.monotonic && quality.type === "int" && typeof values[quality.key] === "number")
    .map(({ quality }) => [quality.key, values[quality.key] as number]));

export const marksPlayerLines = (contract: Pick<SharedReadContract, "qualities">): boolean => contract.qualities.some(({ quality }) => readsWorldEvidence(quality));

const renderTranscript = (contract: SharedReadContract) => {
  const marked = marksPlayerLines(contract);
  return contract.window.messages.map((message) => `[${message.index}] ${message.speaker}${marked && message.isUser ? PLAYER_MARK : ""}: ${message.text}`).join("\n");
};

export const READ_TASK_HEADER = "[STORY STATE READ — output structured lines only. Do NOT continue the roleplay or write as any character.]";
export const READ_OUTPUT_RULE = "Write one line per item and nothing else: no prose, no headings, no numbering, no code fences.";

export function readContext(story: Pick<NormalizedStory, "checkpointById" | "roster">, checkpointId: string): Pick<SharedReadContract, "checkpoint" | "cast"> {
  const active = story.checkpointById[checkpointId];
  return {
    ...(active ? { checkpoint: { name: active.name, objective: active.objective } } : {}),
    cast: story.roster.map((member) => ({ id: member.id, name: member.name ?? member.id, ...(member.role ? { role: member.role } : {}) })),
  };
}

const renderCheckpoint = (contract: SharedReadContract) =>
  contract.checkpoint
    ? `Active checkpoint: ${contract.checkpoint.name}${contract.checkpoint.objective ? ` — ${contract.checkpoint.objective}` : ""}`
    : `Active checkpoint: ${contract.activeCheckpointId}`;

const renderCast = (contract: SharedReadContract) =>
  contract.cast?.length
    ? [`Cast (roster id = name): ${contract.cast.map((member) => `${member.id} = ${member.name}${member.role ? ` (${member.role})` : ""}`).join("; ")}`]
    : [];

const renderPlayer = (contract: SharedReadContract) => {
  const names = [...new Set(contract.window.messages.filter((message) => message.isUser).map((message) => message.speaker))];
  return names.length ? [`Player character: ${names.join(", ")}.`] : [];
};

const promiseSection = (contract: SharedReadContract): string | null => (contract.openPromises ? contract.promiseSection ?? "" : null);

export function renderSharedReadPrompt(contract: SharedReadContract): string {
  const deltasOnly = contract.deltasOnly === true;
  return [
    READ_TASK_HEADER,
    `Story: ${contract.storyTitle}`,
    renderCheckpoint(contract),
    ...(deltasOnly ? [] : renderCast(contract)),
    ...renderPlayer(contract),
    "Canon-lite:",
    contract.canon || "(none)",
    "",
    "Read only the transcript below. Propose only changes directly supported by quoted evidence.",
    "Closed vocabulary: you may only write listed quality keys and allowed values.",
    "Output zero or more lines in exactly these formats:",
    "DELTA q=<quality_key> value=<json_literal> evidence=\"exact quote from transcript\"",
    ...(deltasOnly ? [] : ["FACT importance=<1|2|3> text=\"fact text\" evidence=\"exact quote from transcript\""]),
    "If nothing changed, output NO_DELTA.",
    "value is a JSON literal: true, 3 or \"a listed value\". evidence is copied word for word from one transcript line, without its [index] Speaker: prefix.",
    READ_OUTPUT_RULE,
    "",
    ...(deltasOnly ? [] : [renderMemoryContractAddendum(contract.openArcs ?? [], contract.epistemicLedgerCapable ?? false, contract.entities ?? [], promiseSection(contract)), ""]),
    ...(!deltasOnly && contract.hearsay ? [HEARSAY_RULE, ""] : []),
    ...(!deltasOnly && contract.witnessSection ? [contract.witnessSection, ""] : []),
    "Quality questions:",
    renderType(contract) || "(no in-scope qualities)",
    "",
    "Transcript:",
    renderTranscript(contract) || "(empty)",
    "",
    ...(readsAnyStep(contract) ? [STEP_READ_REMINDER] : []),
    "Output:",
  ].join("\n");
}

export function renderPlayerOnlyReask(contract: SharedReadContract, lines: readonly string[]): string {
  const prompt = renderSharedReadPrompt({ ...contract, deltasOnly: true });
  return `${prompt.slice(0, prompt.lastIndexOf("\nOutput:"))}\n${PLAYER_ONLY_REASK}\n${lines.join("\n")}\n\nOutput:`;
}

export function hashContract(contract: SharedReadContract): string {
  return fnv1a(stableStringify({
    storyTitle: contract.storyTitle,
    activeCheckpointId: contract.activeCheckpointId,
    qualities: contract.qualities.map((quality) => quality.key),
    window: { from: contract.window.from, to: contract.window.to },
    canon: contract.canon,
    openArcs: contract.openArcs ?? [],
    epistemicLedgerCapable: contract.epistemicLedgerCapable ?? false,
    entities: contract.entities ?? [],
    ...(contract.window.form ? { windowForm: contract.window.form } : {}),
    ...(marksPlayerLines(contract) ? { playerLines: true } : {}),
    ...(contract.deltasOnly ? { deltasOnly: true } : {}),
    ...(contract.counted && Object.keys(contract.counted).length ? { counted: contract.counted } : {}),
    ...(contract.openPromises ? { promises: contract.openPromises.map((ref) => ref.id) } : {}),
    ...(contract.witnessSection ? { witness: true } : {}),
    ...(contract.hearsay ? { hearsay: true } : {}),
  }));
}
