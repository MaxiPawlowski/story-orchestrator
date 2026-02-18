import React from "react";

const TalkControlDefaultsSection: React.FC = () => (
  <div className="st-panel shadow-sm">
    <div className="st-panel-header flex items-center justify-between gap-2 px-3 py-2 font-semibold">Talk Control</div>
    <div className="flex flex-col gap-3 p-3">
      <div className="text-xs st-muted">
        Talk control allows characters to automatically respond at specific story moments. Configure automated replies per checkpoint in the Checkpoint Editor's Talk Control tab.
      </div>
    </div>
  </div>
);

export default TalkControlDefaultsSection;

