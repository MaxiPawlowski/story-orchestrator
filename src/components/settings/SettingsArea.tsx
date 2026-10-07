import type { ReactNode, SyntheticEvent } from "react";
import type { FeatureArea } from "@features/registry";
import { SETTINGS_ADVANCED_LABEL, SETTINGS_AREA_COPY, settingsGuideLabel } from "@features/settingsCopy";
import { Advanced } from "./Field";

export interface SettingsAreaProps {
  area: FeatureArea;
  open: boolean;
  onToggle(area: FeatureArea, open: boolean): void;
  onGuide(doc: string): void;
  advanced?: ReactNode;
  children?: ReactNode;
}

export const settingsAreaId = (area: FeatureArea): string => `so-area-${area}`;

export const SettingsArea = ({ area, open, onToggle, onGuide, advanced, children }: SettingsAreaProps) => {
  const copy = SETTINGS_AREA_COPY[area];
  const id = settingsAreaId(area);
  const toggled = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open;
    if (next !== open) onToggle(area, next);
  };
  return (
    <details id={id} data-so="settings-area" data-area={area} className="so-settings-section" open={open} onToggle={toggled}>
      <summary>
        {copy.label} <span className="opacity-70 font-normal">— {copy.oneLine}</span>
        <button
          type="button"
          data-so="settings-area-guide"
          className="menu_button fa-solid fa-circle-question inline-flex align-middle ml-2"
          aria-label={settingsGuideLabel(area)}
          title={settingsGuideLabel(area)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onGuide(copy.doc);
          }}
        />
      </summary>
      <div className="flex flex-col gap-3 pt-2">
        {children}
        {advanced && <Advanced id={`${id}-advanced`} label={SETTINGS_ADVANCED_LABEL}>{advanced}</Advanced>}
      </div>
    </details>
  );
};

export default SettingsArea;
