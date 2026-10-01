import { renderGateText } from "@engine/index";
import type { StoryGraphDraft } from "@components/studio/graphPanelUtils";
import type { StoryDraft } from "./draft";

type DraftCheckpoint = StoryDraft["checkpoints"][number];

const declaredChapters = (draft: StoryDraft) => {
  const chapters = (draft.chapters ?? []).map((chapter) => ({ id: chapter.id, label: chapter.title || chapter.id }));
  const known = new Set(chapters.map((chapter) => chapter.id));
  const laneOf = (checkpoint: DraftCheckpoint) => (checkpoint.chapter && known.has(checkpoint.chapter) ? checkpoint.chapter : undefined);
  return { chapters, laneOf };
};

export const toGraphDraft = (draft: StoryDraft): StoryGraphDraft => {
  const { chapters, laneOf } = declaredChapters(draft);
  return {
    start: draft.checkpoints.find((checkpoint) => checkpoint.start)?.id ?? draft.checkpoints[0]?.id,
    ...(chapters.length ? { chapters } : {}),
    checkpoints: draft.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      name: checkpoint.name,
      type: draft.scaffolding?.[checkpoint.id] ? "stub" : checkpoint.type,
      ...(laneOf(checkpoint) ? { chapter: laneOf(checkpoint) } : {}),
      transitions: draft.transitions
        .map((transition, index) => ({ transition, index }))
        .filter((entry) => entry.transition.from === checkpoint.id)
        .map((entry) => ({ id: `t${entry.index}`, to: entry.transition.to, label: renderGateText(entry.transition.gate) })),
    })),
  };
};

const escapeLabel = (text: string) => text.replace(/"/g, "'").replace(/[\r\n]+/g, " ");
const escapeEdge = (text: string) => escapeLabel(text).replace(/\|/g, "/");

const mermaidNode = (checkpoint: DraftCheckpoint, indent: string) => {
  const label = escapeLabel(checkpoint.name || checkpoint.id);
  return checkpoint.type === "anchor" ? `${indent}${checkpoint.id}(["${label}"])` : `${indent}${checkpoint.id}["${label}"]`;
};

export const toMermaid = (draft: StoryDraft): string => {
  const lines = ["flowchart TD"];
  const { chapters, laneOf } = declaredChapters(draft);
  chapters.forEach((chapter) => {
    const members = draft.checkpoints.filter((checkpoint) => laneOf(checkpoint) === chapter.id);
    if (members.length) lines.push(`  subgraph chapter_${chapter.id.replace(/\W/g, "_")}["${escapeLabel(chapter.label)}"]`, ...members.map((checkpoint) => mermaidNode(checkpoint, "    ")), "  end");
  });
  draft.checkpoints.filter((checkpoint) => !laneOf(checkpoint)).forEach((checkpoint) => lines.push(mermaidNode(checkpoint, "  ")));
  draft.transitions.forEach((transition) => {
    const gate = escapeEdge(renderGateText(transition.gate));
    lines.push(gate ? `  ${transition.from} -->|"${gate}"| ${transition.to}` : `  ${transition.from} --> ${transition.to}`);
  });
  return lines.join("\n");
};
