import type { WidgetView } from "@runtime/gameTypes";
import { WidgetCard } from "../widgets/WidgetCard";

export function WidgetPanel({ widget }: { widget: WidgetView }) {
  return (
    <div id={`so-widget-${widget.id}`} data-so="widget-panel" className="flex flex-col gap-2 text-sm">
      <WidgetCard widget={widget} heading={false} />
    </div>
  );
}

export default WidgetPanel;
