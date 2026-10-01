import type { RuntimeManager } from "@runtime/index";
import type { InnerFanOut, RuntimeSnapshot } from "@runtime/types";
import { CheckRow } from "./Field";

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
      <CheckRow id="so-inner-harvest" className="text-xs" checked={settings.harvestReasoning === true} onChange={(on) => manager.setMemorySettings({ harvestReasoning: on })}
        label="Read characters' reasoning for what they intend" help={HARVEST_HELP} />
      {settings.harvestReasoning === true && !settings.epistemicLedgerCapable ? (
        <div id="so-inner-harvest-idle" className="text-xs opacity-70">Idle: knowledge tracking is off for the memory model.</div>
      ) : null}
      <CheckRow id="so-inner-beat" className="text-xs" checked={beat} onChange={(on) => manager.setMemorySettings({ innerBeat: on })}
        label="Prepare a private inner beat for the next speaker" help={BEAT_HELP} />
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
