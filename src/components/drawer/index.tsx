// import LoreManager from "./lore/LoreManager";
/* <LoreManager /> */

import Objetives from "./Objetives";
import Requirements from "./Requirements";
import Checkpoints from "./Checkpoints";

import React, { useEffect, useMemo, useState } from "react";
import { useStoryContext } from "@hooks/useStoryContext";

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
    checkpointStatuses,
    checkpointIndex,
  } = useStoryContext();


  const progressText = useMemo(() => {
    if (!checkpointRows) return '';
    return checkpointRows.map((cp: any, i: number) => {
      const status = checkpointStatuses[i] ??
        (i < checkpointIndex ? 'complete' : i === checkpointIndex ? 'current' : 'pending');
      const prefix = status === 'complete' ? '[x] ' : status === 'current' ? '[>] ' : status === 'failed' ? '[!] ' : '[ ] ';
      return `${prefix}${cp.name}`;
    }).join('  |  ');
  }, [checkpointStatuses, checkpointIndex]);


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



