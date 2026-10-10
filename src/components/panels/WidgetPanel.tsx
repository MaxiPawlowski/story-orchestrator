import { useState } from "react";
import type { WidgetView } from "@runtime/gameTypes";
import { recordWidgetAudit } from "@runtime/htmlWidgetAudit";
import { WIDGET_TEXT } from "@features/widgetCopy";
import { WidgetCard, type WidgetAction } from "../widgets/WidgetCard";
import { HtmlWidgetFrame } from "../widgets/HtmlWidgetFrame";

export interface HtmlPanelHost {
  journal: (summary: string, detail: string) => void;
}

const refuseAction: WidgetAction = () => ({ ok: false, reason: WIDGET_TEXT.htmlNoActions });

export function WidgetPanel({ widget, onAction, html }: { widget: WidgetView; onAction?: WidgetAction; html?: HtmlPanelHost | null }) {
  const [away, setAway] = useState(false);
  const framed = widget.body.kind === "html" && Boolean(html) && !away;
  return (
    <div id={`so-widget-${widget.id}`} data-so="widget-panel" className="flex flex-col gap-2 text-sm">
      {framed && html
        ? (
          <HtmlWidgetFrame widget={widget} onIntent={onAction ?? refuseAction} onAudit={(entry) => recordWidgetAudit(entry, html.journal)}
            onNavigatedAway={() => {
              setAway(true);
              recordWidgetAudit({ at: Date.now(), widgetId: widget.id, direction: "host", method: "navigation", outcome: "refused", detail: WIDGET_TEXT.htmlNavigated }, html.journal);
            }} />
        )
        : <WidgetCard widget={widget} heading={false} onAction={onAction} />}
      {away && <div role="status" data-so="html-widget-closed" className="text-xs st-muted">{WIDGET_TEXT.htmlNavigated}</div>}
    </div>
  );
}

export default WidgetPanel;
