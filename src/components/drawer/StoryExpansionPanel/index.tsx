import { useStore } from "zustand";
import { storySessionStore } from "@store/storySessionStore";
import type { GenerationPhase } from "@services/StoryGeneratorService";

const PHASE_LABELS: Record<GenerationPhase, string> = {
  roadmap: "Updating narrative roadmap",
  checkpoint: "Defining next beat",
  transitions: "Planning transitions",
  actions: "Configuring scene actions",
};

const PhaseRow = ({ phase, label, done, active }: { phase: GenerationPhase; label: string; done: boolean; active: boolean }) => (
  <div className={`flex items-center gap-2 text-xs ${active ? "opacity-100" : done ? "opacity-70" : "opacity-30"}`}>
    <span className="w-4 text-center">
      {done ? "✅" : active ? "⏳" : "○"}
    </span>
    <span>{label}</span>
  </div>
);

const PHASES: GenerationPhase[] = ["roadmap", "checkpoint", "transitions", "actions"];

const StoryExpansionPanel = () => {
  const expansion = useStore(storySessionStore, (s) => s.expansion);

  if (!expansion.isExpanding) return null;

  const { phase, phaseDone, preview } = expansion;

  return (
    <div className="border rounded p-2 mt-2 flex flex-col gap-1 text-xs">
      <div className="text-sm font-medium mb-1">Generating next beat…</div>

      {PHASES.map(p => (
        <PhaseRow
          key={p}
          phase={p}
          label={PHASE_LABELS[p]}
          done={!!phaseDone[p]}
          active={phase === p && !phaseDone[p]}
        />
      ))}

      {preview && (
        <div className="mt-2 border-t pt-2 flex flex-col gap-0.5 opacity-80">
          <div className="font-medium truncate" title={preview.checkpointName}>
            {preview.checkpointName}
          </div>
          {preview.checkpointObjective && (
            <div className="opacity-70 line-clamp-2">{preview.checkpointObjective}</div>
          )}
          {preview.transitionCount > 0 && (
            <div className="opacity-60">{preview.transitionCount} path{preview.transitionCount !== 1 ? "s" : ""} forward</div>
          )}
        </div>
      )}
    </div>
  );
};

export default StoryExpansionPanel;
