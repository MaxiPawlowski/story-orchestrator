import type { ProvenanceView, WidgetView } from "@runtime/gameTypes";
import { GAME_TEXT } from "@features/gameCopy";
import { WidgetCard, drawerOpener, type WidgetAction } from "../widgets/WidgetCard";

export interface StatSheetPanelProps {
  sheet: WidgetView | null;
  provenance?: ProvenanceView[];
  onAction?: WidgetAction;
  openDrawer?: () => void;
}

export function StatSheetPanel({ sheet, provenance, onAction, openDrawer }: StatSheetPanelProps) {
  return (
    <div id="so-stat-sheet" data-so="stat-sheet" className="flex flex-col gap-2 text-sm">
      {sheet
        ? <WidgetCard widget={sheet} heading={!sheet.synthesized} provenance={provenance} onAction={onAction} onOpen={drawerOpener(openDrawer)} />
        : <div data-so="stat-sheet-empty" className="text-xs st-muted">{GAME_TEXT.statSheetEmpty}</div>}
    </div>
  );
}

export default StatSheetPanel;
