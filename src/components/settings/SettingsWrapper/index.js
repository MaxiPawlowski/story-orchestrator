import ThinkingSettings from '../ThinkingSettings/index.js';

const SettingsWrapper = () => {
  return (
    <div id="stepthink_settings">
      <div className="inline-drawer">
        <div className="inline-drawer-toggle inline-drawer-header">
          <b>Stepped Thinking React</b>
          <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <ThinkingSettings />
      </div>
    </div>

  );
}

export default SettingsWrapper;
