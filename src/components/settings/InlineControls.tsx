import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { INLINE_CATEGORIES, INLINE_LEVELS, INLINE_WINDOW_MAX, PLAYER_LEVEL_CAP, type InlineCategory, type InlineLevel } from "@runtime/settingsModel";
import { INLINE_CATEGORY_LABELS } from "@runtime/messageInspector";
import { INLINE_CATEGORY_HELP, INLINE_LEVEL_HELP, INLINE_LEVEL_LABELS } from "@features/inlineCopy";
import { settingCopy } from "@features/settingsCopy";
import { SettingRow } from "@components/ui/SettingRow";
import { SegmentedControl } from "@components/ui/SegmentedControl";
import { TextInput } from "@components/ui/Field";
import { DeviceChip, useDeviceSetting, type DeviceStore } from "./DeviceSetting";
import { CheckRow, HelpText } from "./Field";
import { InlineLegendPanel } from "../inline/InlineLegend";

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  deviceStore: DeviceStore;
}

export const InlineControls = ({ snapshot, manager, deviceStore }: GroupProps) => {
  const inline = snapshot.ui.inline;
  const authorView = snapshot.ui.authorView;
  const level = (authorView ? inline.level : snapshot.inline.level) as InlineLevel;
  const offered = INLINE_LEVELS.filter((entry) => authorView || entry <= PLAYER_LEVEL_CAP);
  const notify = () => manager.notify();
  const levelSetting = useDeviceSetting<InlineLevel>("display.inline.level", level, (next) => manager.setInlineSettings({ level: next }), notify, deviceStore);
  const categories = useDeviceSetting<Partial<Record<InlineCategory, boolean>>>("display.inline.categories", inline.categories,
    (next) => manager.setInlineSettings({ categories: next }), notify, deviceStore);
  const window = useDeviceSetting<number>("display.inline.window", inline.window, (next) => manager.setInlineSettings({ window: next }), notify, deviceStore);
  const error = levelSetting.error ?? categories.error ?? window.error;
  return (
    <div id="so-inline-settings" className="so-setting-group">
      <SettingRow label={settingCopy("display.inline.level").label} description={INLINE_LEVEL_HELP[level]} scope={levelSetting.overridden ? "device" : undefined}
        control={<>
          <DeviceChip setting={levelSetting} label="Notes under messages" />
          <SegmentedControl id="so-inline-level" label="Notes under messages" size="sm" value={String(level)}
            options={offered.map((entry) => ({ value: String(entry), label: INLINE_LEVEL_LABELS[entry], title: INLINE_LEVEL_HELP[entry] }))}
            onChange={(next) => levelSetting.write(Number(next) as InlineLevel)} />
        </>} />
      {snapshot.inline.level > 0 && <InlineLegendPanel level={snapshot.inline.level} id="so-inline-legend" />}
      {inline.level > 0 && <>
        <SettingRow label={settingCopy("display.inline.categories").label} description={<HelpText text={settingCopy("display.inline.categories").help} />}
          scope={categories.overridden ? "device" : undefined}
          control={<DeviceChip setting={categories} label="Which notes" />} />
        <div id="so-inline-categories" role="group" className="so-check-grid" aria-label="Which notes">
          {INLINE_CATEGORIES.map((category) => (
            <span key={category} data-so="inline-category" data-category={category}>
              <CheckRow kind="checkbox" checked={inline.categories[category] !== false} label={INLINE_CATEGORY_LABELS[category]} help={INLINE_CATEGORY_HELP[category]}
                onChange={(on) => categories.write({ ...inline.categories, [category]: on })} />
            </span>
          ))}
        </div>
        <SettingRow label={settingCopy("display.inline.window").label} htmlFor="so-inline-window" description={<HelpText text={settingCopy("display.inline.window").help} />}
          scope={window.overridden ? "device" : undefined}
          control={(describedBy) => <>
            <DeviceChip setting={window} label="Only the last messages" />
            <TextInput id="so-inline-window" type="number" size="xs" min={1} max={INLINE_WINDOW_MAX} value={inline.window} aria-describedby={describedBy}
              onChange={(event) => window.write(Math.min(INLINE_WINDOW_MAX, Math.max(1, Math.round(Number(event.target.value) || 1))))} />
          </>} />
      </>}
      {error && <p role="alert" className="so-warning-text">{error}</p>}
    </div>
  );
};

export default InlineControls;
