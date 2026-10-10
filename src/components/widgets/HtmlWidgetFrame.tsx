import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetView } from "@runtime/gameTypes";
import {
  FRAME_HEIGHT, FRAME_SANDBOX, buildSrcdoc, dataNotification, frameData, handleViewMessage, teardownNotification, type AuditEntry, type BridgeState,
} from "@runtime/htmlWidget";
import type { WriteResult } from "@utils/writeResult";
import { WIDGET_TEXT } from "@features/widgetCopy";

export interface HtmlWidgetFrameProps {
  widget: WidgetView;
  onIntent: (text: string) => WriteResult;
  onAudit: (entry: AuditEntry) => void;
  onNavigatedAway: () => void;
  now?: () => number;
}

export const HtmlWidgetFrame = ({ widget, onIntent, onAudit, onNavigatedAway, now = Date.now }: HtmlWidgetFrameProps) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const loads = useRef(0);
  const bridge = useRef<BridgeState>({ lastIntentAt: null });
  const [height, setHeight] = useState<number>(FRAME_HEIGHT.start);
  const template = widget.body.kind === "html" ? widget.body.template : "";
  const srcdoc = useMemo(() => buildSrcdoc(template), [template]);
  const dataKey = JSON.stringify(frameData(widget));
  const latest = useRef(widget);
  latest.current = widget;
  const handlers = useRef({ onIntent, onAudit, onNavigatedAway, now });
  handlers.current = { onIntent, onAudit, onNavigatedAway, now };

  useEffect(() => {
    const node = frame.current;
    const listen = (event: MessageEvent) => {
      const view = node?.contentWindow;
      if (!view || event.source !== view) return;
      const outcome = handleViewMessage(event.data, { widget: latest.current, now: handlers.current.now(), state: bridge.current, fill: (text) => handlers.current.onIntent(text) });
      bridge.current = outcome.state;
      handlers.current.onAudit(outcome.audit);
      if (outcome.height !== undefined) setHeight(outcome.height);
      if (outcome.reply) view.postMessage(outcome.reply, "*");
    };
    window.addEventListener("message", listen);
    return () => {
      window.removeEventListener("message", listen);
      node?.contentWindow?.postMessage(teardownNotification("closed"), "*");
    };
  }, []);

  useEffect(() => {
    const view = frame.current?.contentWindow;
    if (!view || loads.current === 0) return;
    const message = dataNotification(latest.current);
    view.postMessage(message, "*");
    handlers.current.onAudit({ at: handlers.current.now(), widgetId: latest.current.id, direction: "out", method: message.method, outcome: "ok" });
  }, [dataKey]);

  return (
    <iframe
      ref={frame}
      data-so="html-widget"
      title={widget.title}
      sandbox={FRAME_SANDBOX}
      referrerPolicy="no-referrer"
      srcDoc={srcdoc}
      className="so-game-html"
      style={{ height }}
      onLoad={() => {
        loads.current += 1;
        if (loads.current > 1) handlers.current.onNavigatedAway();
      }}
    >
      {WIDGET_TEXT.htmlUnsupported}
    </iframe>
  );
};

export default HtmlWidgetFrame;
