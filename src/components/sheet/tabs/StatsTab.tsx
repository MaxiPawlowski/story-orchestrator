import type { ProvenanceView, WidgetView } from "@runtime/gameTypes";
import { GAME_TEXT } from "@features/gameCopy";
import { EmptyState } from "@components/ui/EmptyState";
import { WidgetCard, drawerOpener, type StoryOpener, type WidgetAction } from "../../widgets/WidgetCard";

export interface StatsTabProps {
  sheet: WidgetView | null;
  provenance?: ProvenanceView[];
  onAction?: WidgetAction;
  openDrawer?: StoryOpener;
}

export function StatsTab({ sheet, provenance, onAction, openDrawer }: StatsTabProps) {
  return (
    <div id="so-stat-sheet" data-so="stat-sheet" className="so-sheet-body">
      {sheet
        ? <WidgetCard widget={sheet} heading={!sheet.synthesized} provenance={provenance} onAction={onAction} onOpen={drawerOpener(openDrawer)} />
        : <div data-so="stat-sheet-empty"><EmptyState icon="fa-list-check" title={GAME_TEXT.statSheetEmpty} /></div>}
    </div>
  );
}

export default StatsTab;
