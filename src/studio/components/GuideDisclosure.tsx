import React from "react";
import { GUIDE_TOPICS, type GuideTopicId } from "@copilot/guideTopics";

const GuideDisclosure: React.FC<{ topics: readonly GuideTopicId[] }> = ({ topics }) => (
  <details id="so-studio-guide" data-so="guide" className="st-subpanel mb-3 p-2 text-xs">
    <summary className="cursor-pointer font-semibold">How to write this</summary>
    <div className="mt-2 flex flex-col gap-1">
      {topics.map((id) => (
        <details key={id} data-so="guide-topic" data-topic={id}>
          <summary className="cursor-pointer">{GUIDE_TOPICS[id].title}</summary>
          <p className="m-0 mt-1 opacity-80"><code>{GUIDE_TOPICS[id].fields}</code></p>
          <p className="m-0 mt-1">{GUIDE_TOPICS[id].text}</p>
        </details>
      ))}
    </div>
  </details>
);

export default GuideDisclosure;
