// import LoreManager from "./lore/LoreManager";
/* <LoreManager /> */

import Objetives from "./Objetives";
import Requirements from "./Requirements";
import Checkpoints from "./Checkpoints";

import React, { useEffect, useState } from "react";
import { useStoryOrchestrator } from "@hooks/useStoryOrchestrator";

const TabSelector = ({ tabs, setActiveTab, activeTab }: { tabs: string[]; setActiveTab: (tab: string) => void; activeTab: string; }) => {
  return (
    <div className="tab-container">
      {tabs.map((tab, index) => (
        <button
          key={index}
          className={`tab-button ${activeTab === tab ? "active" : ""}`}
          onClick={() => setActiveTab(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

const tabs = {
  requirements: "Requirements",
  // lore: "Lore",
  // characters: "Characters",
  // items: "Items",
  // locations: "Locations",
  // objetives: "Objetives",
  achievements: "Achievements",
  checkpoints: "Checkpoints",
  // settings: "Settings",
};

const DrawerWrapper = () => {
  const [activeTab, setActiveTab] = useState(tabs.requirements);
  const [isOpen, setIsOpen] = useState(true);

  const [isMinimized, setIsMinimized] = useState(false);
  const {
    ready,
    title,
    checkpoints: checkpointRows,
    progressText,
    lastEvaluation,
    evaluationHistory,
    // turnsUntilNextCheck,
    // lastQueuedEvaluation,
  } = useStoryOrchestrator({
    autoInit: true,
  });

  useEffect(() => {
    console.log('[DrawerWrapper] Story Orchestrator ready:', ready, 'Title:', title);
    console.log({ progressText });
  }, [ready, title, progressText]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="rounded">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Story Drawer</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={isMinimized ? 'Restore' : 'Minimize'}
            title={isMinimized ? 'Restore' : 'Minimize'}
            className="px-2 py-1 text-sm rounded border bg-transparent"
            onClick={() => setIsMinimized((s) => !s)}
          >
            {isMinimized ? '▢' : '▁'}
          </button>

          <button
            type="button"
            aria-label="Close"
            title="Close"
            className="px-2 py-1 text-sm rounded border bg-transparent"
            onClick={() => setIsOpen(false)}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-2">
        {!isMinimized && (
          <>
            <TabSelector
              tabs={Object.values(tabs)}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />

            <div className="mt-3">
              {activeTab === tabs.requirements && <Requirements />}
              {/* {activeTab === tabs.lore && <LoreManager />} */}
              {/* {activeTab === tabs.objetives && <Objetives />} */}
              {activeTab === tabs.checkpoints && (
                <Checkpoints
                  title={title}
                  checkpoints={checkpointRows}
                  progressText={progressText}
                  lastEvaluation={lastEvaluation}
                // evaluationHistory={evaluationHistory}
                // turnsUntilNextCheck={turnsUntilNextCheck}
                // lastQueuedEvaluation={lastQueuedEvaluation}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DrawerWrapper;



