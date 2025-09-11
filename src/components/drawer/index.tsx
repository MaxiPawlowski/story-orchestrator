// import LoreManager from "./lore/LoreManager";
/* <LoreManager /> */

import Objetives from "./Objetives";
import Requirements from "./Requirements";
import Checkpoints from "./Checkpoints";

import React, { useState } from "react";

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

  return (
    <div className="">
      <TabSelector
        tabs={Object.values(tabs)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
      {activeTab === tabs.requirements && <Requirements />}
      {/* {activeTab === tabs.lore && <LoreManager />} */}
      {/* {activeTab === tabs.objetives && <Objetives />} */}
      {activeTab === tabs.checkpoints && <Checkpoints />}
    </div>
  );
};

export default DrawerWrapper;
