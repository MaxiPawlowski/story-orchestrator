import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import { composeActivity } from "@runtime/activityFeed";
import { setupFindings } from "@runtime/repair";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { Button } from "@components/ui/Button";
import { MessageCitation } from "../MessageCitation";

const ActivityPanel = lazyRetry(() => import("../../panels/ActivityPanel"));

const TALK_SOURCE_LABELS: Record<string, string> = {
  mention: "name mention",
  director: "LLM director",
  rules: "weighted rules",
  fallback: "rules fallback",
  spotlight: "spotlight (a quiet member took the voice)",
  reaction: "reaction beat",
};

const TalkDecisionsPanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const decisions = [...snapshot.talk.decisions].reverse();
  return (
    <div className="so-console-block">
      <h4>Speaker direction</h4>
      {!snapshot.talk.enabled && <div className="so-muted">Disabled in settings.</div>}
      {decisions.length === 0 ? (
        <div className="so-muted">No decisions yet. Recorded when a talk-control checkpoint picks the next speaker.</div>
      ) : (
        decisions.map((decision) => (
          <div key={`${decision.checkpointId}-${decision.messageId}-${decision.at}`} className="so-console-item">
            <div className="so-strong">
              {decision.chosenName ?? (decision.chainStep !== undefined ? "back to the player" : "silence")}{" "}
              <span className="so-muted">
                via {TALK_SOURCE_LABELS[decision.source] ?? decision.source}
                {decision.chainStep !== undefined ? ` · voice ${decision.chainStep + 1}` : ""}
              </span>
            </div>
            <div><MessageCitation messageId={decision.messageId} prefix="msg" /> · {decision.checkpointId} · {decision.latencyMs} ms</div>
          </div>
        ))
      )}
    </div>
  );
};

const ReconciliationPanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const events = [...snapshot.extraction.reconciliationEvents].reverse();
  return (
    <div className="so-console-block">
      <h4>Stall re-checks</h4>
      {events.length === 0 ? (
        <div className="so-muted">None. Queued when a checkpoint overstays its target length with gate qualities still unmet.</div>
      ) : (
        events.map((event) => (
          <div key={`${event.id}-${event.scheduledAt}`} className="so-console-item">
            <div className="so-strong">{event.resolvedAt ? "✔ resolved" : "… pending"} · boundary {event.boundary} · {event.checkpointId}</div>
            <div>chasing {event.targetedKeys.join(", ") || "recent scenes"}</div>
            {event.evidence.map((line) => <div key={line} className="so-muted">{line}</div>)}
          </div>
        ))
      )}
    </div>
  );
};

const AuthorMovesPanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (
  <div id="so-author-moves" className="so-console-block">
    <h4>Author moves</h4>
    {(snapshot.authorMoves ?? []).length === 0 ? (
      <div className="so-muted">None yet. Advance, Nudge and Report from the driver are listed here.</div>
    ) : (snapshot.authorMoves ?? []).map((move) => (
      <div key={`${move.at}-${move.summary}`} data-so="author-move" className="so-console-item">
        <div className="so-strong">{move.summary}</div>
        <div><MessageCitation messageId={move.messageId} prefix="msg" /> · boundary {move.boundary}</div>
        {move.note ? <div className="so-muted so-pre">{move.note.length > 280 ? `${move.note.slice(0, 279)}…` : move.note}</div> : null}
      </div>
    ))}
  </div>
);

const setupCount = (snapshot: RuntimeSnapshot) => {
  const findings = setupFindings(snapshot);
  return findings.blocks.length + findings.degrades.length;
};

const takeAlternate = (manager: RuntimeManager, alternate: string | null | undefined) => (alternate ? manager.activateCheckpoint(alternate) : undefined);

const RefusedRoute = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => (
  <>
    {snapshot.agencyRecovery && (
      <div data-so="agency-recovery" className="so-console-block">
        <h4>Refused route</h4>
        <div>The player&apos;s last {snapshot.agencyRecovery.turns} turns were read, and nothing in them moved an exit of {snapshot.agencyRecovery.checkpointName}.</div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {snapshot.agencyRecovery.alternate && (
            <Button size="sm" data-so="agency-take-alternate" onClick={() => void takeAlternate(manager, snapshot.agencyRecovery?.alternate)}>Take {snapshot.agencyRecovery.alternateName}</Button>
          )}
          {snapshot.agencyRecovery.canGenerate && (
            <Button size="sm" data-so="agency-generate-road" onClick={() => void manager.runExpansionNow(undefined, true)}>Generate the road ahead</Button>
          )}
        </div>
      </div>
    )}
  </>
);

export const ActivitySection = ({ snapshot, manager, onJump, onOpenHealth }: {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  onJump?: (messageId: number) => void;
  onOpenHealth?: () => void;
}) => (
  <div className="so-console-stack">
    <RefusedRoute snapshot={snapshot} manager={manager} />
    <Lazy fallback={null}><ActivityPanel rows={composeActivity(snapshot.inline, snapshot.rolls ?? [])} onJump={onJump} setupCount={setupCount(snapshot)}
      onOpenHealth={onOpenHealth} /></Lazy>
    <AuthorMovesPanel snapshot={snapshot} />
    <TalkDecisionsPanel snapshot={snapshot} />
    <ReconciliationPanel snapshot={snapshot} />
  </div>
);
