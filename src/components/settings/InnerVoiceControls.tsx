import type { RuntimeManager } from "@runtime/index";
import type { InnerFanOut, RuntimeSnapshot } from "@runtime/types";
import HelpTooltip from "@components/studio/HelpTooltip";

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

const HARVEST_HELP = "When a character's reply carries its reasoning, the epistemic read also looks there for what that character intends. Needs the knowledge tracking "
  + "profile. Off until its measured floor passes.";
const BEAT_HELP = "After a character reply, the memory model writes a short private note of what the likely next speaker wants to do, handed only to that character when "
  + "they are drafted. At most two extra calls per player turn, never on the reply path. Off until its measured floor passes.";

export const InnerVoiceControls = ({ snapshot, manager }: GroupProps) => {
  const settings = snapshot.memory.settings;
  const beat = settings.innerBeat === true;
  return (
    <div id="so-inner-voice-settings" className="flex flex-col gap-1 text-sm">
      <span>Inner voice</span>
      <label className="flex items-center gap-2 text-xs">
        <input id="so-inner-harvest" type="checkbox" checked={settings.harvestReasoning === true} onChange={(event) => manager.setMemorySettings({ harvestReasoning: event.target.checked })} />
        <span>Read characters&apos; reasoning for what they intend <HelpTooltip title={HARVEST_HELP} /></span>
      </label>
      {settings.harvestReasoning === true && !settings.epistemicLedgerCapable ? (
        <div id="so-inner-harvest-idle" className="text-xs opacity-70">Idle: knowledge tracking is off for the memory model.</div>
      ) : null}
      <label className="flex items-center gap-2 text-xs">
        <input id="so-inner-beat" type="checkbox" checked={beat} onChange={(event) => manager.setMemorySettings({ innerBeat: event.target.checked })} />
        <span>Prepare a private inner beat for the next speaker <HelpTooltip title={BEAT_HELP} /></span>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span>Inner beats for</span>
        <select id="so-inner-fanout" aria-label="Inner beats for" disabled={!beat} value={settings.innerFanOut ?? "lead"}
          onChange={(event) => manager.setMemorySettings({ innerFanOut: event.target.value as InnerFanOut })}>
          <option value="lead">The likely speaker</option>
          <option value="top2">The two likeliest speakers</option>
        </select>
      </label>
    </div>
  );
};

export default InnerVoiceControls;
