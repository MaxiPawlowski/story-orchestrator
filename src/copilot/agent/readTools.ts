import { evaluateGate, isValidationErrorList, parseStoryV2, renderGateText, type PrimitiveValue, type StoryV2 } from "@engine/index";
import { isRecord } from "@utils/guards";
import { storyCoverage, renderCoverage } from "../../studio/coverage";
import { runDiagnostics } from "../../studio/diagnostics";
import { defaultValueForOp, opsForType } from "../../studio/gateOptions";
import { findQualityUsages } from "../../studio/qualityUsage";
import { readGuide } from "../guideTopics";
import type { ReadToolName } from "./tools";
import type { AgentLookup } from "./types";

const LOOKUP_LIMIT = 50;

const json = (value: unknown) => JSON.stringify(value);

const BLOCKS = ["arc_template", "arc_bridges", "requirements", "stagecraft", "scene_read", "lore_select", "house_rules"] as const satisfies readonly (keyof StoryV2)[];

const summarizeStory = (draft: StoryV2): string => json({
  title: draft.title,
  description: draft.description,
  qualities: draft.qualities.map((quality) => ({ key: quality.key, type: quality.type, ...(quality.values ? { values: quality.values } : {}), ...(quality.latching ? { latching: true } : {}) })),
  checkpoints: draft.checkpoints.map(({ id, name, type, start, objective }) => ({ id, name, type, ...(start ? { start: true } : {}), objective })),
  transitions: draft.transitions.map((transition) => ({ from: transition.from, to: transition.to, priority: transition.priority, gate: renderGateText(transition.gate) })),
  roster: draft.roster,
  blocks: Object.fromEntries(BLOCKS.filter((key) => draft[key] !== undefined).map((key) => [key, draft[key]])),
});

const readCheckpoint = (draft: StoryV2, id: string): string => {
  const checkpoint = draft.checkpoints.find((entry) => entry.id === id);
  if (!checkpoint) return `No checkpoint "${id}". Known: ${draft.checkpoints.map((entry) => entry.id).join(", ") || "(none)"}.`;
  const outgoing = draft.transitions.filter((transition) => transition.from === id).map((transition) => ({ to: transition.to, priority: transition.priority, gate: renderGateText(transition.gate) }));
  return json({ checkpoint, outgoing });
};

const validationLines = (draft: StoryV2): string => {
  const parsed = parseStoryV2(draft);
  if (!isValidationErrorList(parsed)) return "Valid: 0 errors.";
  return `${parsed.length} error(s):\n${parsed.map((error) => `- ${error.path}: ${error.message}`).join("\n")}`;
};

const diagnosticLines = (draft: StoryV2): string => {
  const diagnostics = runDiagnostics(draft);
  if (!diagnostics.length) return "No diagnostics.";
  return diagnostics.map((diagnostic) => `- [${diagnostic.severity}] ${diagnostic.code} at ${diagnostic.path}: ${diagnostic.message}`).join("\n");
};

export const reachability = (draft: StoryV2): { reachable: string[]; unreachable: string[]; deadEnds: string[] } => {
  const start = draft.checkpoints.find((checkpoint) => checkpoint.start)?.id ?? draft.checkpoints[0]?.id;
  const seen = new Set<string>();
  const queue = start ? [start] : [];
  while (queue.length) {
    const current = queue.shift() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    draft.transitions.filter((transition) => transition.from === current).forEach((transition) => queue.push(transition.to));
  }
  return {
    reachable: [...seen],
    unreachable: draft.checkpoints.filter((checkpoint) => !seen.has(checkpoint.id)).map((checkpoint) => checkpoint.id),
    deadEnds: draft.checkpoints.filter((checkpoint) => checkpoint.type !== "anchor" && !draft.transitions.some((transition) => transition.from === checkpoint.id)).map((checkpoint) => checkpoint.id),
  };
};

const isPrimitive = (value: unknown): value is PrimitiveValue => ["string", "number", "boolean"].includes(typeof value);

export const simulateWalk = (draft: StoryV2, steps: unknown[]): string => {
  const story = parseStoryV2(draft);
  if (isValidationErrorList(story)) return `Cannot simulate an invalid story. ${validationLines(draft)}`;
  const values: Record<string, PrimitiveValue> = {};
  let active = story.startCheckpointId;
  Object.assign(values, story.checkpointById[active]?.state_snapshot ?? {});
  const lines = steps.map((step, index) => {
    if (!isRecord(step)) return `${index + 1}: skipped (a step is an object of quality values)`;
    const unknown = Object.keys(step).filter((key) => !story.qualityByKey[key]);
    Object.entries(step).forEach(([key, value]) => { if (story.qualityByKey[key] && isPrimitive(value)) values[key] = value; });
    const fired = (story.outgoingByCheckpoint[active] ?? []).find((transition) => evaluateGate(transition.gate, { get: (key) => values[key] }));
    const note = unknown.length ? ` (not qualities: ${unknown.join(", ")})` : "";
    if (!fired) return `${index + 1}: stays at ${active}${note}`;
    active = fired.to;
    Object.assign(values, story.checkpointById[active]?.state_snapshot ?? {});
    return `${index + 1}: ${fired.from} → ${fired.to} on ${renderGateText(fired.gate)}${note}`;
  });
  return [...lines, `ends at ${active}`].join("\n");
};

const lookupNames = (names: string[], query: unknown): string => {
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
  const matches = names.filter((name) => !needle || name.toLowerCase().includes(needle));
  if (!matches.length) return needle ? `Nothing matches "${needle}".` : "None on this install.";
  return `${matches.length} found${matches.length > LOOKUP_LIMIT ? `, first ${LOOKUP_LIMIT}` : ""}: ${matches.slice(0, LOOKUP_LIMIT).join(", ")}`;
};

const safeNames = (read: () => string[]): string[] => {
  try { return read(); } catch { return []; }
};

export const runReadTool = (tool: ReadToolName, args: Record<string, unknown>, draft: StoryV2, lookup: AgentLookup): string => {
  switch (tool) {
    case "readStory":
      return summarizeStory(draft);
    case "readCheckpoint":
      return readCheckpoint(draft, String(args.id));
    case "readGraph":
      return draft.transitions
        .map((transition, index) => `${index + 1}. ${transition.from} → ${transition.to} [p${transition.priority}] ${renderGateText(transition.gate)}`)
        .join("\n") || "No transitions.";
    case "readDiagnostics":
      return diagnosticLines(draft);
    case "readValidation":
      return validationLines(draft);
    case "readQualityUsage": {
      const usages = findQualityUsages(draft, String(args.key));
      return usages.length ? usages.map((usage) => `- ${usage.kind}: ${usage.location}`).join("\n") : `"${String(args.key)}" is not read anywhere.`;
    }
    case "readGateOptions": {
      const quality = draft.qualities.find((entry) => entry.key === args.key);
      if (!quality) return `No quality "${String(args.key)}". Declare it with addQuality first.`;
      return json(opsForType(quality.type).map((op) => ({ op, example: defaultValueForOp(quality, op) })));
    }
    case "readCoverage":
      return renderCoverage(storyCoverage(draft));
    case "readGuide":
      return readGuide(args.topic);
    case "simulateReachability":
      return json(reachability(draft));
    case "simulateWalk":
      return simulateWalk(draft, Array.isArray(args.steps) ? args.steps : []);
    case "lookupCharacters":
      return lookupNames(safeNames(lookup.characters), args.query);
    case "lookupLorebooks":
      return lookupNames(safeNames(lookup.lorebooks), args.query);
    case "lookupGroups":
      return lookupNames(safeNames(lookup.groups), args.query);
    case "lookupBackgrounds":
      return lookupNames(safeNames(lookup.backgrounds), args.query);
    default:
      return "Unknown read tool.";
  }
};
