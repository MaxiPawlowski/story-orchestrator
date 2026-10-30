import type { ReactNode } from "react";
import { PLAYER_COPY, requirementNotReadyText, rollbackNoticeText, rollbackUnavailableText, type RequirementKind } from "@runtime/narrative";
import { statusSentence } from "@runtime/pipeline";
import type { RuntimeSnapshot } from "@runtime/types";
import { StatusIcon } from "@components/ui/StatusDot";
import { Button } from "@components/ui/Button";

export interface PlayerOverviewProps {
  snapshot: RuntimeSnapshot;
  onOpenSettings?: () => void;
  onReread?: () => void;
  onRestart?: () => void;
  onRetry?: () => void;
  setupCovers?: boolean;
  children?: ReactNode;
}

const ATTENTION_STATES = new Set(["stalled-rechecking", "error", "not-configured"]);

export const SETUP_COVERS_TEXT = "Paused until the setup below is fixed.";

export const chapterChip = (snapshot: Pick<RuntimeSnapshot, "chapters">, headline: string): string | null => {
  const current = snapshot.chapters?.declared ? snapshot.chapters.current : null;
  if (!current || current.interlude) return null;
  return current.playerTitle && current.playerTitle !== headline ? `Chapter ${current.number} · ${current.playerTitle}` : `Chapter ${current.number}`;
};

const MissingRequirements = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const all: Array<{ kind: RequirementKind; missing: string[] }> = [
    { kind: "persona", missing: snapshot.requirements.missingPersonas },
    { kind: "cast", missing: [...snapshot.requirements.missingMembers, ...(snapshot.requirements.mutedMembers ?? [])] },
    { kind: "lore", missing: snapshot.requirements.missingLorebooks },
  ];
  const items = all.filter((item) => item.missing.length > 0);
  if (!items.length) return null;
  return (
    <div id="so-player-requirements" className="so-scene-notes">
      <p className="so-play-label">{PLAYER_COPY.requirementsHeading}</p>
      {items.map((item) => (
        <p key={item.kind} className="so-scene-note">
          <StatusIcon tone="error" />
          <span>{requirementNotReadyText(item.kind)}</span>
        </p>
      ))}
    </div>
  );
};

export const PlayerOverview = ({ snapshot, onOpenSettings, onReread, onRestart, onRetry, setupCovers = false, children }: PlayerOverviewProps) => {
  const { narrative, pipeline } = snapshot;
  const now = narrative.sections.find((section) => section.id === "now")?.lines ?? [];
  const headline = narrative.headline || now[0] || PLAYER_COPY.currentScene;
  const lines = now.filter((line) => line !== headline);
  const chip = chapterChip(snapshot, headline);
  const covered = setupCovers && pipeline.needsSetup;
  const notes = (narrative.sections.find((section) => section.id === "status")?.lines ?? []).filter((line) => line !== pipeline.text);
  return (
    <section id="so-player-overview" data-so="scene-header" className="so-scene" aria-labelledby="so-scene-title">
      <header id="so-scene-header" className="so-scene-head">
        <h2 id="so-scene-title" className="so-scene-title">{headline}</h2>
        {chip && <span data-so="scene-chapter" className="so-scene-chip">{chip}</span>}
      </header>
      {lines.map((line) => <p key={line} className="so-scene-line">{line}</p>)}
      <div id="so-pipeline-status" className="so-scene-status" data-state={pipeline.state}>
        <span id={ATTENTION_STATES.has(pipeline.state) ? "so-stall-signal" : undefined}>{covered ? SETUP_COVERS_TEXT : statusSentence(pipeline)}</span>
        {pipeline.retryable && onRetry && (
          <Button id="so-pipeline-retry" size="sm" icon="fa-rotate" onClick={onRetry}>{PLAYER_COPY.retryButton}</Button>
        )}
        {pipeline.needsSetup && !covered && onOpenSettings && (
          <Button id="so-open-story-settings" size="sm" icon="fa-gear" onClick={onOpenSettings}>{PLAYER_COPY.openSettingsButton}</Button>
        )}
        {notes.map((line) => <span key={line} data-so="status-note">{line}</span>)}
      </div>
      {snapshot.lastRollback && <p id="so-rollback-notice" className="so-scene-note">{rollbackNoticeText(snapshot.lastRollback)}</p>}
      {snapshot.rollbackUnavailable && (
        <div id="so-rollback-unavailable" className="so-scene-notes" role="status">
          <p className="so-scene-note">{rollbackUnavailableText({ ...snapshot.rollbackUnavailable, checkpointName: "the current scene" })}</p>
          <div className="so-actions">
            {onReread && <Button id="so-reread-checkpoint" size="sm" onClick={onReread}>{PLAYER_COPY.rereadButton}</Button>}
            {onRestart && <Button id="so-rollback-restart" size="sm" variant="danger" onClick={onRestart}>{PLAYER_COPY.restartButton}</Button>}
          </div>
        </div>
      )}
      <MissingRequirements snapshot={snapshot} />
      {children}
    </section>
  );
};

export default PlayerOverview;
