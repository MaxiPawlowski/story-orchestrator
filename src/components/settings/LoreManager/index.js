import { useEffect, useState } from "react";
import { settings } from "../../../constants/main";
import { saveSettingsDebounced } from "../../../services/SillyTavernAPI";

import "../../../services/ChainOfThought";

const LoreManagerSettings = () => {
  const [displayPanel, setDisplayPanel] = useState(settings.displayPanel);
  const [collapseTextareas, setCollapseTextareas] = useState(
    settings.collapseTextareas
  );
  const [collapsedTextareaHeight, setCollapsedTextareaHeight] = useState(
    settings.collapsedTextareaHeight
  );
  const [expandedTextareaHeight, setExpandedTextareaHeight] = useState(
    settings.expandedTextareaHeight
  );

  const onDisplayPanelChange = (e) => {
    setDisplayPanel(e.target.checked);
    saveSettingsDebounced();
  };
  const onCollapseTextareasChange = (e) => {
    setCollapseTextareas(e.target.checked);
    saveSettingsDebounced();
  };
  const onCollapsedTextareaHeightChange = (e) => {
    setCollapsedTextareaHeight(e.target.value);
    saveSettingsDebounced();
  };
  const onExpandedTextareaHeightChange = (e) => {
    setExpandedTextareaHeight(e.target.value);
    saveSettingsDebounced();
  };

  useEffect(() => {
    setDisplayPanel(settings.displayPanel);
    setCollapseTextareas(settings.collapseTextareas);
    setCollapsedTextareaHeight(settings.collapsedTextareaHeight);
    setExpandedTextareaHeight(settings.expandedTextareaHeight);
  }, []);

  return (
    <div className="lvm--settings">
      <div className="inline-drawer">
        <div className="inline-drawer-toggle inline-drawer-header">
          <b>Lore Variables</b>
          <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div className="inline-drawer-content">
          <div className="flex-container">
            <label>
              <small>Display Variable Panel</small>
              <br />
              <input
                type="checkbox"
                id="lvm--displayPanel"
                checked={displayPanel}
                onChange={onDisplayPanelChange}
              />
            </label>
          </div>
          <div className="flex-container">
            <label>
              <small>Collapse Textareas</small>
              <br />
              <input
                type="checkbox"
                id="lvm--collapseTextareas"
                onChange={onCollapseTextareasChange}
                checked={collapseTextareas}
              />
            </label>
          </div>
          <div className="flex-container">
            <label>
              <small>Collapsed Textarea Height (px)</small>
              <br />
              <input
                type="number"
                className="text_pole"
                min="0"
                id="lvm--collapsedTextareaHeight"
                onInput={onCollapsedTextareaHeightChange}
                value={collapsedTextareaHeight}
              />
            </label>
          </div>
          <div className="flex-container">
            <label>
              <small>
                Expanded Textarea Height (px, adjust to content = -1)
              </small>
              <br />
              <input
                type="number"
                className="text_pole"
                min="0"
                id="lvm--expandedTextareaHeight"
                onInput={onExpandedTextareaHeightChange}
                value={expandedTextareaHeight}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoreManagerSettings;
