import React, { useEffect, useRef, useState } from "react";
import { GUIDE_TOPICS, type GuideTopicId } from "@copilot/guideTopics";
import { authorGuideDoc } from "@features/guideLinks";
import { GUIDE_COPY } from "@features/helpCopy";
import { IconButton } from "@components/ui/IconButton";
import "../mobile.css";

interface GuideDisclosureProps {
  topics: readonly GuideTopicId[];
  onOpenGuide?: (doc: string) => void;
}

const GuideDisclosure: React.FC<GuideDisclosureProps> = ({ topics, onOpenGuide }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  if (!topics.length) return null;
  const openTopic = (id: GuideTopicId) => {
    setOpen(false);
    rootRef.current?.querySelector<HTMLButtonElement>("#so-studio-guide")?.focus();
    onOpenGuide?.(authorGuideDoc(id));
  };
  return (
    <div ref={rootRef} data-so="guide" className="so-studio-menu"
      onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); event.preventDefault(); setOpen(false); } }}>
      <IconButton id="so-studio-guide" icon="fa-circle-question" label="How to write this" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)} />
      {open && (
        <div className="so-studio-menu-list so-studio-guide-list" role="group" aria-label="How to write this">
          {topics.map((id) => (
            <div key={id} data-so="guide-topic" data-topic={id} className="so-studio-guide-topic">
              <button type="button" data-so="guide-topic-open" data-doc={authorGuideDoc(id)} className="so-studio-menu-item"
                aria-label={`${GUIDE_COPY.openInGuide}: ${GUIDE_TOPICS[id].title}`} disabled={!onOpenGuide} onClick={() => openTopic(id)}>
                <span className="so-studio-guide-title">{GUIDE_TOPICS[id].title}</span>
                <span className="so-studio-guide-text">{GUIDE_TOPICS[id].text}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GuideDisclosure;
