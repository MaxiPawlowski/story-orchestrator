import {
  StoryEngine, gateKeys, isValidationErrorList, parseStoryV2, type EngineState, type PrimitiveValue, type StoryV2, type StoryWidget,
} from "@engine/index";
import { composeGame } from "@runtime/widgets";
import type { WidgetBody, WidgetView } from "@runtime/gameTypes";

export interface WidgetSample {
  values: Readonly<Record<string, PrimitiveValue>>;
  reached: readonly string[];
}

export type WidgetPreview =
  | { status: "shown"; view: WidgetView; lines: string[] }
  | { status: "hidden"; reason: string }
  | { status: "invalid"; reason: string };

export const PREVIEW_HIDDEN = "Not shown in this sample: its visible when does not hold, or it has nothing to show yet.";
export const PREVIEW_INVALID = "Fix the story's validation errors to preview this panel.";

const bindKeys = (widget: StoryWidget, draft: StoryV2): string[] => {
  const bind = widget.bind;
  if (!bind) return [];
  if ("quality" in bind) return [bind.quality];
  if ("qualities" in bind) return bind.qualities;
  if ("group" in bind) return draft.qualities.filter((quality) => quality.display?.group === bind.group).map((quality) => quality.key);
  return [];
};

export const previewKeys = (widget: StoryWidget, draft: StoryV2): string[] => [...new Set([
  ...(widget.visible_when ? gateKeys(widget.visible_when) : []),
  ...bindKeys(widget, draft),
  ...(widget.clues ?? []).flatMap((clue) => gateKeys(clue.when)),
  ...(widget.pins ?? []).flatMap((pin) => (pin.when ? gateKeys(pin.when) : [])),
])].filter((key) => draft.qualities.some((quality) => quality.key === key));

export const previewCheckpoints = (widget: StoryWidget): string[] => [...new Set((widget.pins ?? []).flatMap((pin) => (pin.checkpoint ? [pin.checkpoint] : [])))];

const sampleState = (base: EngineState, sample: WidgetSample, known: ReadonlySet<string>): EngineState => {
  const reached = sample.reached.filter((id) => known.has(id) && id !== base.activeCheckpointId);
  const path = [...base.visitedPath, ...reached];
  return {
    ...base,
    blackboard: { ...base.blackboard, values: { ...base.blackboard.values, ...sample.values } },
    visitedPath: path,
    activeCheckpointId: path.at(-1) ?? base.activeCheckpointId,
  };
};

const pct = (value: number) => `${Math.round(value)}%`;

export const describeBody = (body: WidgetBody): string[] => {
  switch (body.kind) {
    case "clues": return [
      ...body.clues.map((clue) => `Clue: ${clue.text}${clue.action ? ` [button: ${clue.action}]` : ""}`),
      ...body.links.map((link) => `Link: ${body.clues[link.from].text} ↔ ${body.clues[link.to].text}${link.label ? ` (${link.label})` : ""}`),
    ];
    case "map": return [
      `Image: ${body.image}`,
      ...body.pins.map((pin) => `Pin: ${pin.label} at ${pct(pin.x)}, ${pct(pin.y)}${pin.here ? " (you are here)" : ""}${pin.action ? ` [button: ${pin.action}]` : ""}`),
    ];
    case "meters": return body.groups.flatMap((group) => group.items.map((item) => `${group.label}: ${item.label} ${item.text}`));
    case "clock": return [`Clock: ${body.label} ${body.filled}/${body.segments}${body.full ? " (full)" : ""}`];
    case "board": return body.lanes.map((lane) => `${lane.label}: ${lane.cards.join(" · ")}`);
    case "track": return [
      ...(body.main?.current ? [`Now: ${body.main.current}`] : []),
      ...(body.main?.done.length ? [`Reached: ${body.main.done.join(" · ")}`] : []),
      ...body.quests.map((quest) => `Quest: ${quest.title} (${quest.statusLabel})`),
    ];
    case "log": return body.rows.map((row) => `Log: ${row.text}`);
    case "html": return [
      `HTML panel: ${body.template.length} characters, sandboxed, shown the view of '${body.source.id}'`,
      ...body.actions.map((intent) => `Action ${intent.id}: ${intent.text}`),
      ...describeBody(body.source.body).map((line) => `Plain version: ${line}`),
    ];
  }
};

export const startValues = (draft: StoryV2): Readonly<Record<string, PrimitiveValue>> => {
  const story = parseStoryV2(draft);
  if (isValidationErrorList(story)) return {};
  const engine = new StoryEngine();
  engine.loadStory(story);
  return engine.serialize().blackboard.values;
};

export const sampleDefault = (type: string | undefined, values: readonly string[] | undefined): PrimitiveValue => {
  if (type === "bool") return false;
  if (type === "enum") return values?.[0] ?? "";
  if (type === "int" || type === "float") return 0;
  return "";
};

export function previewWidget(draft: StoryV2, widgetId: string, sample: WidgetSample): WidgetPreview {
  const story = parseStoryV2(draft);
  if (isValidationErrorList(story)) return { status: "invalid", reason: PREVIEW_INVALID };
  const engine = new StoryEngine();
  engine.loadStory(story);
  const state = sampleState(engine.serialize(), sample, new Set(Object.keys(story.checkpointById)));
  const castNames = Object.fromEntries(story.roster.map((member) => [member.id, member.name ?? member.id]));
  const composed = composeGame({ story, state, boundaryLog: [], checks: [], threads: { open: [], resolved: [] }, chat: [], castNames });
  const all = [...composed.player.widgets, ...composed.player.journal, ...(composed.player.statSheet ? [composed.player.statSheet] : []), ...composed.authorWidgets];
  all.push(...all.flatMap((entry) => (entry.body.kind === "html" ? [entry.body.source] : [])));
  const view = all.find((entry) => entry.id === widgetId && !entry.synthesized);
  return view ? { status: "shown", view, lines: describeBody(view.body) } : { status: "hidden", reason: PREVIEW_HIDDEN };
}
