import type { RuntimeSnapshot } from "@runtime/types";
import { viewerRepairStep, type RepairStep } from "@runtime/repair";
import { REPAIR_PLAYER_COPY } from "@runtime/pipeline";
import { playingLine, playingStory } from "@runtime/playingStory";

export interface EntryPointsProps {
  snapshot: RuntimeSnapshot;
  busy: boolean;
  /** The import block is a body, not a task: it opens from the Start row. */
  importOpen: boolean;
  onToggleImport(): void;
  onNewStory(): void;
  onOpenStudio(): void;
  onOpenDrawer(): void;
  /** Turns Author view on for this chat (it confirms first), then opens the drawer. */
  onOpenAuthorView?(): void;
  /** Reveal a settings control that already exists further down this panel. */
  onRevealSetting(id: string): void;
  onFixWithWizard(): void;
}

export const WIZARD_OFF_REASON = "Turn on the wizard under Author services first.";

const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="so-task-card flex flex-col gap-1" data-so="entry-point" data-task={title.toLowerCase()}>
    <div className="font-medium text-sm">{title}</div>
    {children}
  </div>
);

const RepairAuthorDetail = ({ repair, wizardOn, onFixWithWizard }: { repair: RepairStep; wizardOn: boolean; onFixWithWizard(): void }) => (
  <>
    <div data-so="repair-detail" className="text-xs opacity-70">{repair.detail}</div>
    {repair.provisionable && (
      <div className="flex flex-wrap items-center gap-2">
        <button
          id="so-entry-fix-with-wizard"
          type="button"
          className="menu_button"
          disabled={!wizardOn}
          title={wizardOn ? "Open the wizard on the provisioning step, pre-filled with what this story is missing." : WIZARD_OFF_REASON}
          onClick={onFixWithWizard}
        >Fix with wizard</button>
        {!wizardOn && <span data-so="wizard-off-reason" className="text-xs opacity-70">{WIZARD_OFF_REASON}</span>}
      </div>
    )}
  </>
);

export default function EntryPoints({ snapshot, busy, importOpen, onToggleImport, onNewStory, onOpenStudio, onOpenDrawer, onOpenAuthorView, onRevealSetting, onFixWithWizard }: EntryPointsProps) {
  const repair = viewerRepairStep(snapshot);
  const playing = playingStory(snapshot);
  const wizardOn = snapshot.copilot.enabled;

  return (
    <div id="so-entry-points" className="so-task-grid">
      <Row title="Start">
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="so-new-story-wizard"
            type="button"
            className="menu_button"
            disabled={busy || !wizardOn}
            title={wizardOn
              ? "Start a new story from a premise: the wizard interviews you, proposes the graph, and creates the cards, lore and group it needs."
              : WIZARD_OFF_REASON}
            onClick={onNewStory}
          >New story (wizard)</button>
          <button id="so-entry-import-toggle" type="button" className="menu_button" aria-expanded={importOpen} onClick={onToggleImport}>{importOpen ? "Hide import" : "Import a story"}</button>
        </div>
        <div className="text-xs opacity-70">{wizardOn ? "Build a story with the wizard, or bring your own JSON." : `Bring your own JSON. ${WIZARD_OFF_REASON}`}</div>
      </Row>
      <Row title="Continue">
        <div id="so-entry-continue" className="text-xs opacity-80">
          {playingLine(playing)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="menu_button" disabled={busy} onClick={() => onRevealSetting("story-library-select")}>Choose a story</button>
          <button type="button" className="menu_button" disabled={busy || !snapshot.storyId} onClick={() => onRevealSetting("so-restart-story")}>Restart or export</button>
        </div>
      </Row>
      <Row title="Repair">
        {repair ? (
          <div id="so-entry-repair" data-so="repair-step" data-area={repair.area} className="flex flex-col gap-1">
            <div className="text-xs so-warning-text">{repair.consequence}</div>
            {repair.targetId && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" data-so="repair-reveal" className="menu_button" onClick={() => onRevealSetting(repair.targetId as string)}>Show me the setting</button>
              </div>
            )}
            {snapshot.ui.authorView && <RepairAuthorDetail repair={repair} wizardOn={wizardOn} onFixWithWizard={onFixWithWizard} />}
          </div>
        ) : (
          <div id="so-entry-repair" className="text-xs opacity-70">{REPAIR_PLAYER_COPY.nothingMissing}</div>
        )}
      </Row>
      <Row title="Author">
        <div className="flex flex-wrap items-center gap-2">
          {(!snapshot.storyId || snapshot.ui.authorView) && <button id="so-open-studio" type="button" className="menu_button" disabled={busy} onClick={onOpenStudio}>Open Studio</button>}
          {snapshot.storyId && !snapshot.ui.authorView && (
            <button id="so-entry-author-view" type="button" className="menu_button" onClick={onOpenAuthorView ?? onOpenDrawer}>Turn on Author view</button>
          )}
        </div>
        <div className="text-xs opacity-70">Edit the story, cast and what players may see.</div>
      </Row>
    </div>
  );
}
