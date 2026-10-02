import { readsWorldEvidence, TENSION_CURRENT_KEY, TENSION_FRESH_MESSAGES, TENSION_LEVELS, type NormalizedStoryV2, type TensionLevel } from "@engine/index";
import { renderMemoryContractAddendum } from "@memory/contract";
import { fnv1a, stableStringify } from "@runtime/hash";
import type { SharedReadContract } from "./types";

const TENSION_SCALE: Record<TensionLevel, string> = {
  calm: "safety, rest, or routine; no active threat",
  stirring: "unease, foreshadowing, or first signs of trouble",
  tense: "open conflict, danger, or pressure in the current scene",
  critical: "high stakes in motion: violence, chase, ultimatum, imminent loss",
  peak: "climactic confrontation or catastrophe at full intensity",
};

export const WORLD_EVIDENCE_RULE = "Evidence must quote a line the player did not write.";
export const PARTY_EVIDENCE_RULE = "Evidence may quote the player's own line only where the player moves themselves or the party; anything else must quote a line the player did not write.";
export const PLAYER_MARK = " (player)";

const renderType = (contract: SharedReadContract) => contract.qualities.map(({ quality, hints }) => {
  const hintText = hints.length ? ` Hints: ${hints.join(" | ")}` : "";
  if (quality.key === TENSION_CURRENT_KEY) {
    return [
      `- ${TENSION_CURRENT_KEY}: type=level; Rate the tension as it stands in the newest ${TENSION_FRESH_MESSAGES} messages — pick the highest level whose description ` +
        `they meet, not the average mood; a threat earlier in the window that has since been answered, defused or left behind no longer counts. Write value as one ` +
        `quoted level and cite the strongest signal from those newest messages.${hintText}`,
      ...TENSION_LEVELS.map((level) => `  ${level}: ${TENSION_SCALE[level]}`),
    ].join("\n");
  }
  const allowed = quality.values?.length ? ` Allowed values: ${quality.values.join(", ")}.` : "";
  const world = quality.evidence_from === "party" ? ` ${PARTY_EVIDENCE_RULE}` : quality.evidence_from === "world" ? ` ${WORLD_EVIDENCE_RULE}` : "";
  return `- ${quality.key}: type=${quality.type}; ${quality.rubric}${allowed}${hintText}${world}`;
}).join("\n");

export const marksPlayerLines = (contract: Pick<SharedReadContract, "qualities">): boolean => contract.qualities.some(({ quality }) => readsWorldEvidence(quality));

const renderTranscript = (contract: SharedReadContract) => {
  const marked = marksPlayerLines(contract);
  return contract.window.messages.map((message) => `[${message.index}] ${message.speaker}${marked && message.isUser ? PLAYER_MARK : ""}: ${message.text}`).join("\n");
};

export const READ_TASK_HEADER = "[STORY STATE READ — output structured lines only. Do NOT continue the roleplay or write as any character.]";
export const READ_OUTPUT_RULE = "Write one line per item and nothing else: no prose, no headings, no numbering, no code fences.";

export function readContext(story: Pick<NormalizedStoryV2, "checkpointById" | "roster">, checkpointId: string): Pick<SharedReadContract, "checkpoint" | "cast"> {
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
    ...(deltasOnly ? [] : [renderMemoryContractAddendum(contract.openArcs ?? [], contract.epistemicLedgerCapable ?? false, contract.entities ?? []), ""]),
    "Quality questions:",
    renderType(contract) || "(no in-scope qualities)",
    "",
    "Transcript:",
    renderTranscript(contract) || "(empty)",
    "",
    "Output:",
  ].join("\n");
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
  }));
}
