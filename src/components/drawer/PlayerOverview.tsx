import { rollbackNoticeText } from "@runtime/narrative";
import type { RuntimeSnapshot } from "@runtime/types";

export interface PlayerOverviewProps {
  snapshot: RuntimeSnapshot;
  onOpenSettings?: () => void;
}

// The default (player) surface: the narrative composition the runtime already builds, plus the
// honest working/stuck/not-configured line. Nothing here may name a checkpoint the player has not
// reached, a gate, a counter or a control that steers the story (spec addendum §Personas).
const ATTENTION_STATES = new Set(["stalled-rechecking", "error", "not-configured"]);

const MissingRequirements = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const items = [
    { label: "Persona", missing: snapshot.requirements.missingPersonas },
    { label: "Cast", missing: snapshot.requirements.missingMembers },
    { label: "Lore", missing: snapshot.requirements.missingLorebooks },
  ].filter((item) => item.missing.length > 0);
  if (!items.length) return null;
  return (
    <div id="so-player-requirements" className="flex flex-col gap-1">
      <div className="font-medium">This story still needs</div>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          <span className="status-indicator status-error" />
          <span>{item.label}: {item.missing.join(", ")}</span>
        </div>
      ))}
    </div>
  );
};

const NowSection = ({ lines }: { lines: string[] }) => (
  <div className="checkpoints-wrapper flex flex-col gap-1">
    <div className="font-medium">Where you are</div>
    <div className="st-checkpoint-row status-current">
      <div className="font-semibold">{lines[0]}</div>
      {lines.slice(1).map((line) => <div key={line} className="text-sm opacity-80">{line}</div>)}
    </div>
  </div>
);

export const PlayerOverview = ({ snapshot, onOpenSettings }: PlayerOverviewProps) => {
  const { narrative, pipeline } = snapshot;
  const sections = narrative.sections.filter((section) => section.id !== "status");
  return (
    <div id="so-player-overview" className="flex flex-col gap-3">
      {sections.map((section) => (
        section.id === "now"
          ? <NowSection key={section.id} lines={section.lines} />
          : (
            <div key={section.id} className="flex flex-col gap-1">
              <div className="font-medium">{section.label}</div>
              {section.lines.map((line) => <div key={line} className="text-sm opacity-80 whitespace-pre-wrap">{line}</div>)}
            </div>
          )
      ))}
      {snapshot.lastRollback && (
        <div id="so-rollback-notice" className="text-xs opacity-90">{rollbackNoticeText(snapshot.lastRollback)}</div>
      )}
      <MissingRequirements snapshot={snapshot} />
      <div id="so-pipeline-status" className={`text-xs flex items-center gap-2 flex-wrap ${pipeline.state === "idle" ? "opacity-60" : "opacity-90"}`}>
        {ATTENTION_STATES.has(pipeline.state)
          ? <span id="so-stall-signal">{pipeline.text}</span>
          : <span>{pipeline.text}</span>}
        {pipeline.needsSetup && onOpenSettings && (
          <button id="so-open-story-settings" type="button" className="menu_button" onClick={onOpenSettings}>Open story settings</button>
        )}
      </div>
    </div>
  );
};

export default PlayerOverview;
