import React, { useState, useEffect } from "react";
import LoreVarComponent from "../LoreVariable";

const LoreEntry = ({ entry, onEntryChange }) => {
  const [isEnabled, setIsEnabled] = useState(entry.isEnabled);
  const [isCollapsed, setIsCollapsed] = useState(
    JSON.parse(
      localStorage.getItem(`lvm--entry.collapsed(${entry.id})`) || "true"
    )
  );

  useEffect(() => {
    localStorage.setItem(
      `lvm--entry.collapsed(${entry.id})`,
      JSON.stringify(isCollapsed)
    );
  }, [isCollapsed, entry.id]);

  const handleEnabledChange = (e) => {
    const checked = e.target.checked;
    setIsEnabled(checked);
    onEntryChange({ ...entry, isEnabled: checked });
  };

  const handleCollapseToggle = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleVarChange = (updatedVar) => {
    const updatedVarList = entry.varList.map((v) =>
      v.name === updatedVar.name ? updatedVar : v
    );
    onEntryChange({ ...entry, varList: updatedVarList });
  };

  return (
    <div
      className={`lvm--entry ${!isEnabled ? "lvm--disabled" : ""} ${
        isCollapsed ? "lvm--collapsed" : ""
      }`}
    >
      <div className="lvm--title">
        <span className="lvm--key" onClick={handleCollapseToggle}>
          {entry.key}
        </span>
        <span className="lvm--world">{entry.world}</span>
        <span className="lvm--enabled">
          <input
            type="checkbox"
            title="Is this lore entry enabled?"
            checked={isEnabled}
            onChange={handleEnabledChange}
          />
        </span>
      </div>
      {!isCollapsed && (
        <div className="lvm--vars">
          {entry.varList.map((loreVar) => (
            <LoreVarComponent
              key={loreVar.name}
              loreVar={loreVar}
              onChange={handleVarChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default LoreEntry;
