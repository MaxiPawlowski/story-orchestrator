import { isOpenStretch, type GateLeaf, type GateNode, type Story } from "@engine/index";

type LeadCode = "one-clue-exit";

export const LEAD_CONSEQUENCES: Record<LeadCode, string> = {
  "one-clue-exit": "Every way out of this beat hangs on one clue: if the player misses it, the scene stalls with nothing to fall back on.",
};

export interface LeadRun {
  draft: Story;
  push: (code: LeadCode, severity: "info", path: string, message: string) => void;
}

const leafId = (leaf: GateLeaf): string => JSON.stringify([leaf.q, leaf.op, leaf.v]);

export const needsLeaf = (gate: GateNode, id: string): boolean => {
  if ("q" in gate) return leafId(gate) === id;
  if ("all" in gate) return gate.all.some((child) => needsLeaf(child, id));
  if ("any" in gate) return gate.any.length > 0 && gate.any.every((child) => needsLeaf(child, id));
  return false;
};

const leaves = (gate: GateNode): GateLeaf[] =>
  ("q" in gate ? [gate] : "all" in gate ? gate.all.flatMap(leaves) : "any" in gate ? gate.any.flatMap(leaves) : []);

export const oneClueLeaf = (draft: Pick<Story, "qualities" | "transitions">, checkpointId: string): GateLeaf | null => {
  const exits = draft.transitions.filter((transition) => transition.from === checkpointId);
  if (!exits.length) return null;
  const extractor = new Set(draft.qualities.filter((quality) => quality.source === "extractor").map((quality) => quality.key));
  return leaves(exits[0].gate).filter((leaf) => extractor.has(leaf.q)).find((leaf) => exits.every((transition) => needsLeaf(transition.gate, leafId(leaf)))) ?? null;
};

export const checkLeadDiagnostics = ({ draft, push }: LeadRun) => {
  draft.checkpoints.forEach((checkpoint, index) => {
    if (isOpenStretch(checkpoint) || checkpoint.agency?.alternate || (checkpoint.leads?.length ?? 0) >= 2) return;
    const leaf = oneClueLeaf(draft, checkpoint.id);
    if (!leaf) return;
    push("one-clue-exit", "info", `checkpoints.${index}.leads`,
      `every exit of "${checkpoint.name}" needs "${leaf.q}" to read ${JSON.stringify(leaf.v)}; give it at least two leads (different ways the world can point there), `
        + "a turn-count fallback on an exit, or an agency alternate (three clues for every conclusion you need)");
  });
};
