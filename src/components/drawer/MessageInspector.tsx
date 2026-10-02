import { useEffect, useRef } from "react";
import type { InlineView } from "@runtime/inlineTimeline";
import { inspectMessage } from "@runtime/messageInspector";
import { InlineDetail, type InlineActions } from "../inline/InlineDetail";
import { MessageCitation } from "./MessageCitation";

export interface MessageInspectorProps {
  view: InlineView;
  messageId: number;
  onClose: () => void;
  actions?: InlineActions;
}

export const MessageInspector = ({ view, messageId, onClose, actions }: MessageInspectorProps) => {
  const inspection = inspectMessage(view, messageId);
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start" });
    ref.current?.focus({ preventScroll: true });
  }, [messageId]);
  return (
    <section
      ref={ref} tabIndex={-1} id="so-inspector" data-mesid={messageId}
      aria-label={`Message ${messageId}`} className="flex flex-col gap-2 border border-solid border-white/10 rounded p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">Message {messageId} <MessageCitation messageId={messageId} prefix="msg" /></div>
        <button type="button" id="so-inspector-close" className="menu_button text-xs" aria-label="Close the inspector" onClick={onClose}>Close</button>
      </div>
      {!inspection.inWindow && <div data-so="inspector-outside" className="text-xs opacity-70">This message is older than the timeline window, so only what is still recorded shows.</div>}
      {inspection.sections.length === 0 && <div data-so="inspector-empty" className="text-xs opacity-70">Nothing the story recorded is tied to this message.</div>}
      {inspection.sections.map((section) => (
        <div key={section.category} data-so="inspector-section" data-category={section.category} className="flex flex-col gap-1">
          <div className="text-xs font-medium opacity-80">{section.label}</div>
          <InlineDetail items={section.items} showDetail showActions actions={actions} />
        </div>
      ))}
    </section>
  );
};

export default MessageInspector;
