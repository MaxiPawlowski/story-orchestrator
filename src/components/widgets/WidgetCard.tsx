import { useState } from "react";
import type { WidgetDrawerTab } from "@engine/index";
import type {
  BoardLane, ClueLinkView, ClueView, IntentView, LogRowView, MainLineView, PinView, ProvenanceView, QuestView, RosterRowView, SheetGroupView, SheetItemView, TimelineChapterView,
  WidgetBody, WidgetView,
} from "@runtime/gameTypes";
import type { WriteResult } from "@utils/writeResult";
import { requestDrawerTab } from "@runtime/drawerTab";
import { GAME_TEXT } from "@features/gameCopy";
import { WIDGET_TEXT, changedAgoText, provenanceText, rollHintText } from "@features/widgetCopy";

const ICON: Record<string, string> = {
  scroll: "fa-scroll", flag: "fa-flag", star: "fa-star", heart: "fa-heart", shield: "fa-shield-halved", hourglass: "fa-hourglass-half", compass: "fa-compass",
  key: "fa-key", gem: "fa-gem", book: "fa-book",
};

const TREND: Record<NonNullable<SheetItemView["trend"]>, string> = { up: "↑", down: "↓", flat: "→" };

const Bar = ({ value, min = 0, max }: { value: number; min?: number; max: number }) => (
  <span className="so-game-bar" aria-hidden="true">
    <span className="so-game-bar-fill" style={{ width: `${Math.round(((value - min) / Math.max(1, max - min)) * 100)}%` }} />
  </span>
);

const Boxes = ({ filled, total }: { filled: number; total: number }) => (
  <span className="so-game-boxes" aria-hidden="true">
    {Array.from({ length: total }, (_, index) => <span key={index} className={index < filled ? "so-game-box so-game-box--on" : "so-game-box"} />)}
  </span>
);

const Ago = ({ replies }: { replies?: number }) => (replies === undefined ? null : <span data-so="changed-ago" className="text-xs st-muted">{changedAgoText(replies)}</span>);

const SheetItem = ({ item }: { item: SheetItemView }) => {
  const bounded = item.value !== undefined && item.max !== undefined;
  return (
    <li data-so="sheet-item" data-as={item.as} className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <span>{item.label}</span>
        <span className="st-muted text-xs">{item.text}{item.trend ? ` ${TREND[item.trend]}` : ""}</span>
      </div>
      <Ago replies={item.changedAgo} />
      {bounded && item.as === "meter" && <Bar value={item.value ?? 0} min={item.min} max={item.max ?? 0} />}
      {bounded && item.as === "boxes" && <Boxes filled={(item.value ?? 0) - (item.min ?? 0)} total={(item.max ?? 0) - (item.min ?? 0)} />}
    </li>
  );
};

export const SheetGroups = ({ groups }: { groups: SheetGroupView[] }) => (
  <div className="flex flex-col gap-2">
    {groups.map((group) => (
      <section key={group.label} data-so="sheet-group" aria-label={group.label} className="flex flex-col gap-1">
        <div className="text-xs font-medium">{group.label}</div>
        <ul className="flex flex-col gap-1 list-none p-0 m-0">{group.items.map((item) => <SheetItem key={item.label} item={item} />)}</ul>
      </section>
    ))}
  </div>
);

const STEP_MARK: Record<QuestView["steps"][number]["status"], string> = { open: "○", done: "✔", failed: "✘" };

const QuestCard = ({ quest }: { quest: QuestView }) => (
  <li data-so="quest" data-status={quest.status} className="flex flex-col gap-0.5">
    <div className="flex items-center justify-between gap-2">
      <span className={quest.closed ? "st-muted" : "font-medium"}>{quest.title}</span>
      <span className="text-xs st-muted">{quest.statusLabel}{quest.progress ? ` · ${quest.progress.value}/${quest.progress.of}` : ""}</span>
    </div>
    {quest.giver && <span className="text-xs st-muted">{GAME_TEXT.from} {quest.giver}</span>}
    {quest.progress && !quest.closed && <Bar value={quest.progress.value} max={quest.progress.of} />}
    {quest.steps.length > 0 && (
      <ul className="flex flex-col gap-0.5 list-none pl-2 m-0 text-xs">
        {quest.steps.map((step, index) => (
          <li key={index} data-so="quest-step" data-status={step.status}>
            <span aria-hidden="true">{STEP_MARK[step.status]} </span>{step.text}{step.progress ? ` (${step.progress.value}/${step.progress.of})` : ""}
          </li>
        ))}
      </ul>
    )}
    {quest.reward && <span className="text-xs st-muted">{GAME_TEXT.reward}: {quest.reward}</span>}
  </li>
);

const MainLine = ({ main }: { main: MainLineView }) => (
  <section data-so="main-line" aria-label={GAME_TEXT.mainLine} className="flex flex-col gap-0.5">
    <div className="text-xs font-medium">{GAME_TEXT.mainLine}</div>
    {main.current && <div><span className="text-xs st-muted">{GAME_TEXT.mainLineNow}: </span>{main.current}{main.objective ? ` — ${main.objective}` : ""}</div>}
    {main.done.length > 0 && <div className="text-xs st-muted">{GAME_TEXT.mainLineDone}: {main.done.join(" · ")}</div>}
  </section>
);

const Track = ({ main, quests }: { main: MainLineView | null; quests: QuestView[] }) => (
  <div className="flex flex-col gap-2">
    {main && (main.current || main.done.length > 0) && <MainLine main={main} />}
    {quests.length > 0 && (
      <ul data-so="quests" aria-label={GAME_TEXT.quests} className="flex flex-col gap-2 list-none p-0 m-0">
        {quests.map((quest) => <QuestCard key={quest.title} quest={quest} />)}
      </ul>
    )}
  </div>
);

const Log = ({ rows }: { rows: LogRowView[] }) => (
  <ul data-so="game-log" className="flex flex-col gap-1 list-none p-0 m-0 text-xs">
    {rows.map((row) => (
      <li key={`${row.kind}:${row.at.messageId}:${row.at.boundary}:${row.text}`} data-so="log-row" data-kind={row.kind}>
        <span className="st-muted">#{row.at.messageId} </span>{row.actor ? `${row.actor}: ` : ""}{row.text}{row.outcome ? `, ${row.outcome}` : ""}
      </li>
    ))}
  </ul>
);

const Clock = ({ label, filled, segments, full, changedAgo }: { label: string; filled: number; segments: number; full: boolean; changedAgo?: number }) => (
  <div className="flex flex-col gap-0.5">
    <div data-so="clock" data-full={full} className="flex items-center gap-2" role="img" aria-label={`${label}: ${filled} of ${segments}`}>
      <Boxes filled={filled} total={segments} />
      <span className="text-xs st-muted">{full ? GAME_TEXT.clockFull : `${filled}/${segments}`}</span>
    </div>
    <Ago replies={changedAgo} />
  </div>
);

const Roster = ({ rows }: { rows: RosterRowView[] }) => (
  <ul data-so="roster" className="flex flex-col gap-1 list-none p-0 m-0">
    {rows.map((row, index) => (
      <li key={index} data-so="roster-row" className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span>{row.name}</span>
          <span className="st-muted text-xs">{row.status}</span>
        </div>
        <Ago replies={row.changedAgo} />
      </li>
    ))}
  </ul>
);

const Timeline = ({ chapters }: { chapters: TimelineChapterView[] }) => (
  <div data-so="timeline" className="flex flex-col gap-2">
    {chapters.map((chapter, index) => (
      <section key={index} data-so="timeline-chapter" aria-label={chapter.title ?? undefined} className="flex flex-col gap-1">
        {chapter.title && <div className="text-xs font-medium">{chapter.title}</div>}
        <ol className="flex flex-col gap-0.5 list-none p-0 m-0 text-xs">
          {chapter.stops.map((stop, at) => (
            <li key={at} data-so="timeline-stop" data-here={stop.here} data-fresh={stop.fresh} className={`so-game-clue pl-2${stop.fresh ? " so-game-fresh" : ""}`}>
              <span aria-hidden="true">{stop.here ? "● " : "○ "}</span>
              <span className={stop.here ? "font-medium" : undefined}>{stop.name}</span>
              {stop.date && <span className="st-muted"> · {stop.date}</span>}
              {stop.here && <span className="sr-only"> ({WIDGET_TEXT.timelineHere})</span>}
              {stop.fresh && <span className="st-muted"> · {WIDGET_TEXT.fresh}</span>}
            </li>
          ))}
        </ol>
      </section>
    ))}
  </div>
);

const Board = ({ lanes }: { lanes: BoardLane[] }) => (
  <div data-so="board" className="so-game-board">
    {lanes.map((lane) => (
      <section key={lane.label} data-so="board-lane" aria-label={lane.label} className="flex flex-col gap-1">
        <div className="text-xs font-medium">{lane.label}</div>
        <ul className="flex flex-col gap-1 list-none p-0 m-0 text-xs">{lane.cards.map((card) => <li key={card} className="st-subpanel px-2 py-1">{card}</li>)}</ul>
      </section>
    ))}
  </div>
);

export type WidgetAction = (text: string) => WriteResult;
export type WidgetOpen = (tab: WidgetDrawerTab) => WriteResult;

export const drawerOpener = (openDrawer?: () => void): WidgetOpen | undefined => (openDrawer ? (tab) => {
  openDrawer();
  requestDrawerTab(tab);
  return { ok: true };
} : undefined);

const ActionButton = ({ text, onAction, run, hint, kind = "text", note }: {
  text: string; onAction?: WidgetAction; run?: () => WriteResult; hint?: string; kind?: "text" | "open" | "roll"; note?: string;
}) => {
  const [refusal, setRefusal] = useState<string | null>(null);
  const act = run ?? (onAction ? () => onAction(text) : null);
  if (!act) return null;
  return (
    <span className="flex flex-col gap-0.5">
      <button type="button" data-so="widget-action" data-intent={kind} className="st-button secondary so-game-action text-xs self-start" title={hint ?? WIDGET_TEXT.actionHint}
        onClick={() => {
          const result = act();
          setRefusal(result.ok ? null : result.reason);
        }}>
        {kind === "open" && <i className="fa-solid fa-route" aria-hidden="true" />}{kind === "roll" && <i className="fa-solid fa-dice" aria-hidden="true" />} {text}
      </button>
      {note && <span data-so="widget-roll" className="text-xs st-muted">{note}</span>}
      {refusal && <span role="status" data-so="widget-action-refused" className="text-xs st-muted">{refusal}</span>}
    </span>
  );
};

export const IntentButtons = ({ intents, onAction, onOpen }: { intents: IntentView[]; onAction?: WidgetAction; onOpen?: WidgetOpen }) => {
  const shown = intents.filter((intent) => (intent.open ? onOpen : onAction));
  if (!shown.length) return null;
  return (
    <div data-so="widget-intents" className="flex flex-wrap gap-1">
      {shown.map((intent) => {
        const { open } = intent;
        if (open) return <ActionButton key={intent.id} text={intent.text} kind="open" hint={WIDGET_TEXT.openHint} run={() => onOpen?.(open) ?? { ok: false, reason: WIDGET_TEXT.openRefused }} />;
        if (intent.roll) return <ActionButton key={intent.id} text={intent.text} kind="roll" hint={WIDGET_TEXT.rollHint} note={rollHintText(intent.roll)} onAction={onAction} />;
        return <ActionButton key={intent.id} text={intent.text} onAction={onAction} />;
      })}
    </div>
  );
};

export const ProvenanceLines = ({ rows }: { rows?: ProvenanceView[] }) => (rows?.length ? (
  <ul data-so="widget-provenance" aria-label={WIDGET_TEXT.provenance} className="flex flex-col gap-0.5 list-none p-0 m-0 text-xs st-muted border-t pt-2">
    {rows.map((row) => <li key={row.key} data-so="provenance-row" data-key={row.key}>{provenanceText(row)}</li>)}
  </ul>
) : null);

const Clues = ({ clues, links, onAction }: { clues: ClueView[]; links: ClueLinkView[]; onAction?: WidgetAction }) => (
  <div className="flex flex-col gap-2">
    <ul data-so="clues" className="so-game-clues list-none p-0 m-0 text-xs">
      {clues.map((clue, index) => (
        <li key={index} data-so="clue" data-fresh={clue.fresh} className={`so-game-clue st-subpanel px-2 py-1 flex flex-col gap-1${clue.fresh ? " so-game-fresh" : ""}`}>
          <span>{clue.text}{clue.fresh && <span className="st-muted"> · {WIDGET_TEXT.fresh}</span>}</span>
          {clue.action && <ActionButton text={clue.action} onAction={onAction} />}
        </li>
      ))}
    </ul>
    {links.length > 0 && (
      <ul data-so="clue-links" aria-label={WIDGET_TEXT.clueLinks} className="flex flex-col gap-0.5 list-none p-0 m-0 text-xs">
        {links.map((link, index) => (
          <li key={index} data-so="clue-link">
            {clues[link.from].text} <span aria-hidden="true">↔</span><span className="sr-only">{WIDGET_TEXT.linkedTo}</span> {clues[link.to].text}
            {link.label ? <span className="st-muted"> ({link.label})</span> : null}
          </li>
        ))}
      </ul>
    )}
  </div>
);

const backgroundUrl = (name: string) => `backgrounds/${encodeURIComponent(name)}`;

const MapView = ({ image, pins, onAction }: { image: string; pins: PinView[]; onAction?: WidgetAction }) => (
  <div className="flex flex-col gap-2">
    <figure data-so="map" className="so-game-map">
      <img className="so-game-map-image" src={backgroundUrl(image)} alt="" />
      <ul data-so="map-pins" aria-label={WIDGET_TEXT.mapPlaces} className="so-game-map-pins">
        {pins.map((pin, index) => (
          <li key={index} data-so="map-pin" data-here={pin.here} data-fresh={pin.fresh} className={`so-game-pin${pin.here ? " so-game-pin--here" : ""}${pin.fresh ? " so-game-fresh" : ""}`}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
            <i className="fa-solid fa-location-dot so-game-pin-mark" aria-hidden="true" />
            <span>{pin.label}{pin.here ? <span className="sr-only"> ({WIDGET_TEXT.mapHere})</span> : null}</span>
          </li>
        ))}
      </ul>
    </figure>
    {pins.some((pin) => pin.action) && onAction && (
      <div data-so="map-actions" className="flex flex-wrap gap-1">
        {pins.filter((pin) => pin.action).map((pin, index) => <ActionButton key={index} text={pin.action ?? ""} onAction={onAction} />)}
      </div>
    )}
  </div>
);

export const WidgetBodyView = ({ body, onAction }: { body: WidgetBody; onAction?: WidgetAction }) => {
  if (body.kind === "html") return <div data-so="html-fallback"><WidgetBodyView body={body.source.body} onAction={onAction} /></div>;
  if (body.kind === "clues") return <Clues clues={body.clues} links={body.links} onAction={onAction} />;
  if (body.kind === "map") return <MapView image={body.image} pins={body.pins} onAction={onAction} />;
  if (body.kind === "meters") return <SheetGroups groups={body.groups} />;
  if (body.kind === "track") return <Track main={body.main} quests={body.quests} />;
  if (body.kind === "log") return <Log rows={body.rows} />;
  if (body.kind === "clock") return <Clock {...body} />;
  if (body.kind === "roster") return <Roster rows={body.rows} />;
  if (body.kind === "timeline") return <Timeline chapters={body.chapters} />;
  return <Board lanes={body.lanes} />;
};

export interface WidgetCardProps {
  widget: WidgetView;
  heading?: boolean;
  onAction?: WidgetAction;
  onOpen?: WidgetOpen;
  provenance?: ProvenanceView[];
}

export const WidgetCard = ({ widget, heading = true, onAction, onOpen, provenance }: WidgetCardProps) => (
  <section data-so="widget" data-widget={widget.id} data-kind={widget.body.kind} data-accent={widget.accent ?? "default"} data-motion={widget.still ? "off" : undefined}
    aria-label={widget.title} className="so-game-widget flex flex-col gap-1">
    {heading && (
      <div className="flex items-center gap-1 text-xs font-medium">
        {widget.icon && <i className={`fa-solid ${ICON[widget.icon] ?? "fa-scroll"}`} aria-hidden="true" />}
        <span>{widget.title}</span>
      </div>
    )}
    <WidgetBodyView body={widget.body} onAction={onAction} />
    <IntentButtons intents={(widget.body.kind === "html" ? widget.body.source.actions : widget.actions) ?? []} onAction={onAction} onOpen={onOpen} />
    <ProvenanceLines rows={provenance} />
  </section>
);

export default WidgetCard;
