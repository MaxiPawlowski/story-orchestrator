import type { WidgetView } from "@runtime/gameTypes";
import { GAME_TEXT } from "@features/gameCopy";
import { WidgetCard } from "../widgets/WidgetCard";

export interface StatSheetPanelProps {
  sheet: WidgetView | null;
}

export function StatSheetPanel({ sheet }: StatSheetPanelProps) {
  return (
    <div id="so-stat-sheet" data-so="stat-sheet" className="flex flex-col gap-2 text-sm">
      {sheet ? <WidgetCard widget={sheet} heading={!sheet.synthesized} /> : <div data-so="stat-sheet-empty" className="text-xs st-muted">{GAME_TEXT.statSheetEmpty}</div>}
    </div>
  );
}

export default StatSheetPanel;
