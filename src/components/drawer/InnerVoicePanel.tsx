import { activeEpistemic, withoutLapsedIntents, type CastVoice, type EpistemicEntry, type InnerBeat } from "@memory/index";
import type { RuntimeSnapshot } from "@runtime/types";

export type InnerBeatLabel = "fresh" | "used" | "unused" | "stale";

const norm = (value: string) => value.trim().toLowerCase();

export const innerBeatLabel = (beat: InnerBeat, beats: InnerBeat[], checkpointId: string | null): InnerBeatLabel => {
  if (beat.used) return "used";
  const newest = beats.filter((entry) => entry.memberId === beat.memberId && entry.chatId === beat.chatId).at(-1);
  if (newest !== beat) return "unused";
  return beat.checkpointId === checkpointId ? "fresh" : "stale";
};

export interface InnerVoiceRow {
  voice: CastVoice;
  intents: EpistemicEntry[];
  beat: InnerBeat | null;
  label: InnerBeatLabel | null;
}

export const innerVoiceRows = (snapshot: Pick<RuntimeSnapshot, "innerCast" | "memory" | "boundary" | "activeCheckpointId">): InnerVoiceRow[] => {
  const beats = snapshot.memory.innerBeats ?? [];
  const live = withoutLapsedIntents(activeEpistemic(snapshot.memory.epistemic), { boundary: snapshot.boundary, derived: snapshot.memory.derived });
  return (snapshot.innerCast ?? []).map((voice) => {
    const names = new Set([norm(voice.name), norm(voice.id)]);
    const beat = beats.filter((entry) => entry.memberId === voice.id).at(-1) ?? null;
    return {
      voice,
      intents: live.filter((entry) => entry.tag === "intends" && names.has(norm(entry.subject))),
      beat,
      label: beat ? innerBeatLabel(beat, beats, snapshot.activeCheckpointId) : null,
    };
  });
};

const InnerVoicePanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const rows = innerVoiceRows(snapshot);
  return (
    <div id="so-inner-voice" className="text-xs opacity-80">
      <div className="font-medium opacity-100">Inner voice</div>
      {!rows.length ? (
        <div className="opacity-70">No cast. Drives, motives and intents appear here per character.</div>
      ) : rows.map(({ voice, intents, beat, label }) => (
        <div key={voice.id} data-so="inner-voice-row" className="border-t border-solid border-white/10 mt-1 pt-1">
          <div className="opacity-100">{voice.name}{voice.omniscient ? <span className="opacity-70"> · narrator view</span> : null}</div>
          <div>Drive: {voice.drive ?? <span className="opacity-70">none</span>}</div>
          <div>Right now: {voice.motive ?? <span className="opacity-70">none</span>}</div>
          <div>Intends: {intents.length ? intents.map((entry) => entry.content).join("; ") : <span className="opacity-70">nothing open</span>}</div>
          <div data-so="inner-voice-beat">
            Beat: {beat ? <>{beat.beat}{beat.tone ? ` (${beat.tone})` : ""} <span className="opacity-70">· {label} · msg {beat.basedOnMessageId}</span></> : <span className="opacity-70">none</span>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default InnerVoicePanel;
