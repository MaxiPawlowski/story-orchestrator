import type { RuntimeManager } from "@runtime/index";
import type { InnerFanOut, RuntimeSnapshot } from "@runtime/types";
import { SILENT_REPLY_WINDOW } from "@runtime/thinkingSilence";
import { CheckRow, FieldLabel } from "./Field";

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

export const InnerVoiceControls = ({ snapshot, manager }: GroupProps) => {
  const settings = snapshot.memory.settings;
  const beat = settings.innerBeat === true;
  return (
    <div id="so-inner-voice-settings" className="flex flex-col gap-1 text-sm">
      <span>Inner voice</span>
      <CheckRow id="so-inner-harvest" className="text-xs" checked={settings.harvestReasoning === true} onChange={(on) => manager.setMemorySettings({ harvestReasoning: on })}
        setting="memory.harvestReasoning" />
      {settings.harvestReasoning === true && !settings.epistemicLedgerCapable ? (
        <div id="so-inner-harvest-idle" className="text-xs opacity-70">Idle: knowledge tracking is off for the memory model.</div>
      ) : null}
      {snapshot.thinkingSilent ? (
        <div id="so-inner-harvest-silent" className="text-xs so-warning-text">Nothing to read: the last {SILENT_REPLY_WINDOW} replies carry no reasoning, so the model is not thinking.</div>
      ) : null}
      <CheckRow id="so-inner-beat" className="text-xs" checked={beat} onChange={(on) => manager.setMemorySettings({ innerBeat: on })}
        setting="memory.innerBeat" />
      <div className="flex items-center gap-2 text-xs">
        <FieldLabel htmlFor="so-inner-fanout" setting="memory.innerFanOut" />
        <select id="so-inner-fanout" disabled={!beat} value={settings.innerFanOut ?? "lead"}
          onChange={(event) => manager.setMemorySettings({ innerFanOut: event.target.value as InnerFanOut })}>
          <option value="lead">The likely speaker</option>
          <option value="top2">The two likeliest speakers</option>
        </select>
      </div>
    </div>
  );
};

export default InnerVoiceControls;
