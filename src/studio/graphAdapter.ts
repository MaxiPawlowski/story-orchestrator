import { renderGateText } from "@engine/index";
import type { StoryGraphDraft } from "@components/studio/graphPanelUtils";
import type { StoryDraft } from "./draft";

export const toGraphDraft = (draft: StoryDraft): StoryGraphDraft => ({
  start: draft.checkpoints.find((checkpoint) => checkpoint.start)?.id ?? draft.checkpoints[0]?.id,
  checkpoints: draft.checkpoints.map((checkpoint) => ({
    id: checkpoint.id,
    name: checkpoint.name,
    type: draft.scaffolding?.[checkpoint.id] ? "stub" : checkpoint.type,
    transitions: draft.transitions
      .map((transition, index) => ({ transition, index }))
      .filter((entry) => entry.transition.from === checkpoint.id)
      .map((entry) => ({ id: `t${entry.index}`, to: entry.transition.to, label: renderGateText(entry.transition.gate) })),
  })),
});

const escapeLabel = (text: string) => text.replace(/"/g, "'").replace(/[\r\n]+/g, " ");
const escapeEdge = (text: string) => escapeLabel(text).replace(/\|/g, "/");

export const toMermaid = (draft: StoryDraft): string => {
  const lines = ["flowchart TD"];
  draft.checkpoints.forEach((checkpoint) => {
    const label = escapeLabel(checkpoint.name || checkpoint.id);
    lines.push(checkpoint.type === "anchor" ? `  ${checkpoint.id}(["${label}"])` : `  ${checkpoint.id}["${label}"]`);
  });
  draft.transitions.forEach((transition) => {
    const gate = escapeEdge(renderGateText(transition.gate));
    lines.push(gate ? `  ${transition.from} -->|"${gate}"| ${transition.to}` : `  ${transition.from} --> ${transition.to}`);
  });
  return lines.join("\n");
};
