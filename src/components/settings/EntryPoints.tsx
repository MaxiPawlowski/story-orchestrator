import type { RuntimeSnapshot } from "@runtime/types";
import { nextRepairStep } from "@runtime/repair";

export interface EntryPointsProps {
  snapshot: RuntimeSnapshot;
  busy: boolean;
  /** The import block is a body, not a task: it opens from the Start row. */
  importOpen: boolean;
  onToggleImport(): void;
  onNewStory(): void;
  onOpenStudio(): void;
  /** Reveal a settings control that already exists further down this panel. */
  onRevealSetting(id: string): void;
  onFixWithWizard(): void;
}

const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1" data-so="entry-point" data-task={title.toLowerCase()}>
    <div className="font-medium text-sm">{title}</div>
    {children}
  </div>
);

// v2.3 plan 09. The four things a person does here, named once. The controls stay in their own groups
// below — this is the index, and the one place that says which task is currently asking for something.
// Repair is the only row that can be *dark* (nothing missing), because it is the one that is about a
// defect rather than an intention.
export default function EntryPoints({ snapshot, busy, importOpen, onToggleImport, onNewStory, onOpenStudio, onRevealSetting, onFixWithWizard }: EntryPointsProps) {
  const repair = nextRepairStep(snapshot);
  const playing = snapshot.storyId ? snapshot.library.find((story) => story.id === snapshot.storyId) ?? null : null;

  return (
    <div id="so-entry-points" className="flex flex-col gap-3 border-t border-solid border-white/10 pt-2">
      <Row title="Start">
        <div className="flex flex-wrap items-center gap-2">
          <button id="so-new-story-wizard" className="menu_button" disabled={busy} title="Start a new story from a premise: the wizard interviews you, proposes the graph, and creates the cards, lore and group it needs." onClick={onNewStory}>New story (wizard)</button>
          <button id="so-entry-import-toggle" className="menu_button" aria-expanded={importOpen} onClick={onToggleImport}>{importOpen ? "Hide import" : "Import a story"}</button>
        </div>
        <div className="text-xs opacity-70">Nothing to continue yet? Start here — the wizard builds the cast, lore and graph with you.</div>
      </Row>
      <Row title="Continue">
        <div id="so-entry-continue" className="text-xs opacity-80">
          {playing ? `Playing "${playing.title}".` : "No story is playing in this chat yet."}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="menu_button" disabled={busy} onClick={() => onRevealSetting("story-library-select")}>Choose a story</button>
          <button className="menu_button" disabled={busy || !snapshot.storyId} onClick={() => onRevealSetting("so-restart-story")}>Restart or export</button>
        </div>
      </Row>
      <Row title="Repair">
        {repair ? (
          <div id="so-entry-repair" data-so="repair-step" data-area={repair.area} className="flex flex-col gap-1">
            <div className="text-xs text-yellow-300">{repair.consequence}</div>
            <div className="text-xs opacity-70">{repair.detail}</div>
            <div className="flex flex-wrap items-center gap-2">
              {repair.targetId && <button data-so="repair-reveal" className="menu_button" onClick={() => onRevealSetting(repair.targetId as string)}>Show me the setting</button>}
              {repair.provisionable && <button id="so-entry-fix-with-wizard" className="menu_button" title="Open the wizard on the provisioning step, pre-filled with what this story is missing." onClick={onFixWithWizard}>Fix with wizard</button>}
            </div>
          </div>
        ) : (
          <div id="so-entry-repair" className="text-xs opacity-70">Nothing is missing.</div>
        )}
      </Row>
      <Row title="Author">
        <div className="flex flex-wrap items-center gap-2">
          <button id="so-open-studio" className="menu_button" disabled={busy} onClick={onOpenStudio}>Open Studio</button>
          <button className="menu_button" onClick={() => onRevealSetting("so-author-view")}>Author view</button>
        </div>
        <div className="text-xs opacity-70">Build or edit the story itself — its graph, cast, gates and lore.</div>
      </Row>
    </div>
  );
}
