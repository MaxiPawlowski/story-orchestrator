import ThinkingSettings from "./ChainOfThought/index.js";
import LoreManagerSettings from "./LoreManager/index.js";

const SettingsWrapper = () => {
  return (
    <div id="stepthink_settings">
      <div className="inline-drawer">
        <div className="inline-drawer-toggle inline-drawer-header">
          <b>Project Story</b>
          <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <ThinkingSettings />
        <LoreManagerSettings />
      </div>
    </div>
  );
};

export default SettingsWrapper;
