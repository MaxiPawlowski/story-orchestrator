import React, { useState } from "react";
import { GUIDE_TOPICS, type GuideTopicId } from "@copilot/guideTopics";
import { authorGuideDoc } from "@features/guideLinks";
import { GUIDE_COPY } from "@features/helpCopy";

interface GuideDisclosureProps {
  topics: readonly GuideTopicId[];
  onOpenGuide?: (doc: string) => void;
}

const GuideTopic: React.FC<{ id: GuideTopicId; onOpenGuide?: (doc: string) => void }> = ({ id, onOpenGuide }) => {
  const [open, setOpen] = useState(false);
  return (
    <details data-so="guide-topic" data-topic={id} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer">{GUIDE_TOPICS[id].title}</summary>
      <p className="m-0 mt-1 opacity-80"><code>{GUIDE_TOPICS[id].fields}</code></p>
      <p className="m-0 mt-1">{GUIDE_TOPICS[id].text}</p>
      {onOpenGuide && open && (
        <button type="button" data-so="guide-topic-open" data-doc={authorGuideDoc(id)} className="menu_button mt-1 text-xs"
          aria-label={`${GUIDE_COPY.openInGuide}: ${GUIDE_TOPICS[id].title}`} onClick={() => onOpenGuide(authorGuideDoc(id))}>
          {GUIDE_COPY.openInGuide}
        </button>
      )}
    </details>
  );
};

const GuideDisclosure: React.FC<GuideDisclosureProps> = ({ topics, onOpenGuide }) => (
  <details id="so-studio-guide" data-so="guide" className="st-subpanel mb-3 p-2 text-xs">
    <summary className="cursor-pointer font-semibold">How to write this</summary>
    <div className="mt-2 flex flex-col gap-1">
      {topics.map((id) => <GuideTopic key={id} id={id} onOpenGuide={onOpenGuide} />)}
    </div>
  </details>
);

export default GuideDisclosure;
