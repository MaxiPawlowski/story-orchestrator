import type { BoardLane, LogRowView, MainLineView, QuestView, SheetGroupView, SheetItemView, WidgetBody, WidgetView } from "@runtime/gameTypes";
import { GAME_TEXT } from "@features/gameCopy";

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

const SheetItem = ({ item }: { item: SheetItemView }) => {
  const bounded = item.value !== undefined && item.max !== undefined;
  return (
    <li data-so="sheet-item" data-as={item.as} className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <span>{item.label}</span>
        <span className="st-muted text-xs">{item.text}{item.trend ? ` ${TREND[item.trend]}` : ""}</span>
      </div>
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

const Clock = ({ label, filled, segments, full }: { label: string; filled: number; segments: number; full: boolean }) => (
  <div data-so="clock" data-full={full} className="flex items-center gap-2" role="img" aria-label={`${label}: ${filled} of ${segments}`}>
    <Boxes filled={filled} total={segments} />
    <span className="text-xs st-muted">{full ? GAME_TEXT.clockFull : `${filled}/${segments}`}</span>
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

export const WidgetBodyView = ({ body }: { body: WidgetBody }) => {
  if (body.kind === "meters") return <SheetGroups groups={body.groups} />;
  if (body.kind === "track") return <Track main={body.main} quests={body.quests} />;
  if (body.kind === "log") return <Log rows={body.rows} />;
  if (body.kind === "clock") return <Clock {...body} />;
  return <Board lanes={body.lanes} />;
};

export const WidgetCard = ({ widget, heading = true }: { widget: WidgetView; heading?: boolean }) => (
  <section data-so="widget" data-widget={widget.id} data-kind={widget.body.kind} data-accent={widget.accent ?? "default"} aria-label={widget.title} className="so-game-widget flex flex-col gap-1">
    {heading && (
      <div className="flex items-center gap-1 text-xs font-medium">
        {widget.icon && <i className={`fa-solid ${ICON[widget.icon] ?? "fa-scroll"}`} aria-hidden="true" />}
        <span>{widget.title}</span>
      </div>
    )}
    <WidgetBodyView body={widget.body} />
  </section>
);

export default WidgetCard;
