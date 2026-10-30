import type { SceneView } from "@runtime/gameTypes";
import { SHEET_TEXT } from "@features/sheetCopy";
import { EmptyState } from "@components/ui/EmptyState";
import { SceneCard, type ScenePageOpener } from "../../widgets/WidgetCard";

export const hereNowEmpty = (scene: SceneView): boolean => !scene.location && !scene.time && !scene.present.length;

export interface HereNowTabProps {
  scene: SceneView;
  onPage?: ScenePageOpener;
}

export function HereNowTab({ scene, onPage }: HereNowTabProps) {
  return (
    <div id="so-here-now" data-so="here-now" className="so-sheet-body">
      {hereNowEmpty(scene)
        ? <div data-so="here-now-empty"><EmptyState icon="fa-user-group" title={SHEET_TEXT.nobodyHere} /></div>
        : (
          <>
            <SceneCard {...scene} onPage={onPage} />
            {!scene.present.length && <div data-so="here-now-alone" className="so-sheet-muted">{SHEET_TEXT.nobodyHere}</div>}
          </>
        )}
    </div>
  );
}

export default HereNowTab;
