import { TENSION_CURRENT_KEY, TENSION_LEVELS } from "@engine/index";
import { stableStringify } from "@runtime/hash";
import type { SharedReadContract } from "./types";

const renderType = (contract: SharedReadContract) => contract.qualities.map(({ quality, hints }) => {
  const hintText = hints.length ? ` Hints: ${hints.join(" | ")}` : "";
  if (quality.key === TENSION_CURRENT_KEY) {
    return `- ${TENSION_CURRENT_KEY}: type=level; Rate the current tension: ${TENSION_LEVELS.join(" | ")} — write value as one quoted level, cite the strongest signal.${hintText}`;
  }
  const allowed = quality.values?.length ? ` Allowed values: ${quality.values.join(", ")}.` : "";
  return `- ${quality.key}: type=${quality.type}; ${quality.rubric}${allowed}${hintText}`;
}).join("\n");

const renderTranscript = (contract: SharedReadContract) => contract.window.messages.map((message) => {
  return `[${message.index}] ${message.speaker}: ${message.text}`;
}).join("\n");

export function renderSharedReadPrompt(contract: SharedReadContract): string {
  return [
    `Story: ${contract.storyTitle}`,
    `Active checkpoint: ${contract.activeCheckpointId}`,
    "Canon-lite:",
    contract.canon || "(none)",
    "",
    "Read only the transcript below. Propose only changes directly supported by quoted evidence.",
    "Closed vocabulary: you may only write listed quality keys and allowed values.",
    "Output zero or more lines in exactly these formats:",
    "DELTA q=<quality_key> value=<json_literal> evidence=\"exact quote from transcript\"",
    "FACT importance=<1|2|3> text=\"fact text\" evidence=\"exact quote from transcript\"",
    "If nothing changed, output NO_DELTA.",
    "",
    "Quality questions:",
    renderType(contract) || "(no in-scope qualities)",
    "",
    "Transcript:",
    renderTranscript(contract) || "(empty)",
  ].join("\n");
}

export function hashContract(contract: SharedReadContract): string {
  let hash = 2166136261;
  const text = stableStringify({
    storyTitle: contract.storyTitle,
    activeCheckpointId: contract.activeCheckpointId,
    qualities: contract.qualities.map((quality) => quality.key),
    window: { from: contract.window.from, to: contract.window.to },
    canon: contract.canon,
  });
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
