import { gateKeys, type GateNode, type StoryV2 } from "@engine/index";
import { boundCardQualities } from "@engine/cardFields";

type WidgetCode = "widget-item-never-read" | "map-pin-unreachable" | "map-image-missing" | "html-widget-declared";

export const WIDGET_CONSEQUENCES: Record<WidgetCode, string> = {
  "widget-item-never-read": "This never shows: it waits for a reading nothing in the story asks for, and a panel never asks for one itself.",
  "map-pin-unreachable": "This pin never shows: the story can never reach the checkpoint it waits for.",
  "map-image-missing": "The map shows an empty frame: the install has no background by that name.",
  "html-widget-declared": "This panel runs the story's own page. It is shut off from SillyTavern and sees only its plain panel's view, but read its template before you share the story.",
};

export interface WidgetRun {
  draft: StoryV2;
  context: { backgroundNames?: () => readonly string[] };
  reachableFrom: (start: string) => Set<string>;
  startId: string;
  push: (code: WidgetCode, severity: "warning" | "info", path: string, message: string) => void;
}

const gateList = (gates: ReadonlyArray<GateNode | undefined>): string[] => gates.flatMap((gate) => (gate ? gateKeys(gate) : []));

export const scopedKeys = (draft: StoryV2): Set<string> => {
  const keys = boundCardQualities(draft.roster ?? [], draft.player);
  draft.transitions.forEach((transition) => gateKeys(transition.gate).forEach((key) => keys.add(key)));
  draft.checkpoints.forEach((checkpoint) => Object.keys(checkpoint.state_snapshot ?? {}).forEach((key) => keys.add(key)));
  (draft.quests ?? []).forEach((quest) => gateList([quest.visible_when, quest.offered_when, quest.done_when, quest.failed_when,
    ...(quest.steps ?? []).flatMap((step) => [step.visible_when, step.done_when, step.failed_when])]).forEach((key) => keys.add(key)));
  return keys;
};

const itemGates = (draft: StoryV2) => (draft.widgets ?? []).flatMap((widget, index) => [
  ...(widget.visible_when ? [{ path: `widgets.${index}.visible_when`, gate: widget.visible_when, what: `panel '${widget.id}'` }] : []),
  ...(widget.clues ?? []).map((clue, at) => ({ path: `widgets.${index}.clues.${at}`, gate: clue.when, what: `clue '${clue.id}'` })),
  ...(widget.pins ?? []).flatMap((pin, at) => (pin.when ? [{ path: `widgets.${index}.pins.${at}`, gate: pin.when, what: `pin '${pin.id}'` }] : [])),
]);

export const widgetGateKeys = (draft: StoryV2): Set<string> => new Set(itemGates(draft).flatMap(({ gate }) => gateKeys(gate)));

const checkNeverRead = ({ draft, push }: WidgetRun) => {
  const read = scopedKeys(draft);
  const extractor = new Set(draft.qualities.filter((quality) => quality.source === "extractor").map((quality) => quality.key));
  itemGates(draft).forEach(({ path, gate, what }) => {
    const unread = gateKeys(gate).filter((key) => extractor.has(key) && !read.has(key));
    if (!unread.length) return;
    const names = unread.map((key) => `'${key}'`).join(", ");
    push("widget-item-never-read", "warning", path, `${what} waits for ${names}, which no gate, snapshot, card or quest reads, so it stays at its start value`);
  });
};

const checkPins = ({ draft, reachableFrom, startId, push }: WidgetRun) => {
  const reachable = new Set([startId, ...reachableFrom(startId)]);
  (draft.widgets ?? []).forEach((widget, index) => (widget.pins ?? []).forEach((pin, at) => {
    if (pin.checkpoint && !reachable.has(pin.checkpoint)) {
      push("map-pin-unreachable", "warning", `widgets.${index}.pins.${at}.checkpoint`, `pin '${pin.id}' waits for checkpoint '${pin.checkpoint}', which no path from the start reaches`);
    }
  }));
};

const stem = (name: string) => name.trim().toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "");

const checkImages = ({ draft, context, push }: WidgetRun) => {
  const names = context.backgroundNames?.() ?? [];
  if (!names.length) return;
  const stems = new Set(names.map(stem));
  (draft.widgets ?? []).forEach((widget, index) => {
    if (widget.kind === "map" && widget.image && !stems.has(stem(widget.image))) {
      push("map-image-missing", "warning", `widgets.${index}.image`, `no background '${widget.image}' on this install; add the picture to SillyTavern's backgrounds or pick one from its list`);
    }
  });
};

const listHtml = ({ draft, push }: WidgetRun) => (draft.widgets ?? []).forEach((widget, index) => {
  if (widget.kind !== "html") return;
  const actions = widget.actions?.length ? `; it may put ${widget.actions.length} line(s) in the box: ${widget.actions.map((intent) => intent.id).join(", ")}` : "; it may put nothing in the box";
  push("html-widget-declared", "info", `widgets.${index}.template`, `HTML panel '${widget.id}' (${widget.template?.length ?? 0} characters) shows the view of '${widget.source ?? ""}'${actions}`);
});

export const checkWidgets = (run: WidgetRun) => {
  checkNeverRead(run);
  checkPins(run);
  checkImages(run);
  listHtml(run);
};
