import { useState } from "react";
import type { ProvenanceView, WidgetView } from "@runtime/gameTypes";
import { recordWidgetAudit } from "@runtime/htmlWidgetAudit";
import { WIDGET_TEXT } from "@features/widgetCopy";
import { WidgetCard, drawerOpener, type WidgetAction } from "../widgets/WidgetCard";
import { HtmlWidgetFrame } from "../widgets/HtmlWidgetFrame";

export interface HtmlPanelHost {
  journal: (summary: string, detail: string) => void;
}

const refuseAction: WidgetAction = () => ({ ok: false, reason: WIDGET_TEXT.htmlNoActions });

export interface WidgetPanelProps {
  widget: WidgetView;
  onAction?: WidgetAction;
  html?: HtmlPanelHost | null;
  openDrawer?: () => void;
  provenance?: ProvenanceView[];
}

export function WidgetPanel({ widget, onAction, html, openDrawer, provenance }: WidgetPanelProps) {
  const [away, setAway] = useState(false);
  const onOpen = drawerOpener(openDrawer);
  const framed = widget.body.kind === "html" && Boolean(html) && !away;
  return (
    <div id={`so-widget-${widget.id}`} data-so="widget-panel" className="flex flex-col gap-2 text-sm">
      {framed && html
        ? (
          <HtmlWidgetFrame widget={widget} onIntent={onAction ?? refuseAction} onOpen={onOpen} onAudit={(entry) => recordWidgetAudit(entry, html.journal)}
            onNavigatedAway={() => {
              setAway(true);
              recordWidgetAudit({ at: Date.now(), widgetId: widget.id, direction: "host", method: "navigation", outcome: "refused", detail: WIDGET_TEXT.htmlNavigated }, html.journal);
            }} />
        )
        : <WidgetCard widget={widget} heading={false} onAction={onAction} onOpen={onOpen} provenance={provenance} />}
      {away && <div role="status" data-so="html-widget-closed" className="text-xs st-muted">{WIDGET_TEXT.htmlNavigated}</div>}
    </div>
  );
}

export default WidgetPanel;
