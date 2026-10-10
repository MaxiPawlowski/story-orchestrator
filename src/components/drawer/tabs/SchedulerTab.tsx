import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import StagecraftPanel from "../StagecraftPanel";
import ChaptersPanel from "../ChaptersPanel";
import ModelCallsPanel from "../ModelCallsPanel";
import InnerVoicePanel from "../InnerVoicePanel";
import type { LivingActions } from "../LivingPanel";
import { lazyRetry } from "@utils/lazyRetry";
import { MessageCitation } from "../MessageCitation";

const TALK_SOURCE_LABELS: Record<string, string> = {
  mention: "name mention",
  director: "LLM director",
  rules: "weighted rules",
  fallback: "rules fallback",
};

const TalkDecisionsPanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const decisions = [...snapshot.talk.decisions].reverse();
  return (
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Speaker direction</div>
      {!snapshot.talk.enabled && <div className="opacity-70">Disabled in settings.</div>}
      {decisions.length === 0 ? (
        <div className="opacity-70">No decisions yet. Recorded when a talk-control checkpoint picks the next speaker.</div>
      ) : (
        decisions.map((decision) => (
          <div key={`${decision.checkpointId}-${decision.messageId}-${decision.at}`} className="border-t border-solid border-white/10 mt-1 pt-1">
            <div className="opacity-100">
              {decision.chosenName ?? (decision.chainStep !== undefined ? "back to the player" : "silence")}{" "}
              <span className="opacity-70">
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

// The author half of the stall signal: the player sees "catching up", the author sees which
// keys the re-read is chasing and what it came back with.
const ReconciliationPanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const events = [...snapshot.extraction.reconciliationEvents].reverse();
  return (
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Stall re-checks</div>
      {events.length === 0 ? (
        <div className="opacity-70">None. Queued when a checkpoint overstays its target length with gate qualities still unmet.</div>
      ) : (
        events.map((event) => (
          <div key={`${event.id}-${event.scheduledAt}`} className="border-t border-solid border-white/10 mt-1 pt-1">
            <div className="opacity-100">{event.resolvedAt ? "✔ resolved" : "… pending"} · boundary {event.boundary} · {event.checkpointId}</div>
            <div>chasing {event.targetedKeys.join(", ") || "recent scenes"}</div>
            {event.evidence.map((line) => <div key={line} className="opacity-70">{line}</div>)}
          </div>
        ))
      )}
    </div>
  );
};

const AuthorMovesPanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (
  <div id="so-author-moves" className="text-xs opacity-80">
    <div className="font-medium opacity-100">Author moves</div>
    {(snapshot.authorMoves ?? []).length === 0 ? (
      <div className="opacity-70">None yet. Advance, Nudge and Report from the driver are listed here.</div>
    ) : (snapshot.authorMoves ?? []).map((move) => (
      <div key={`${move.at}-${move.summary}`} data-so="author-move" className="border-t border-solid border-white/10 mt-1 pt-1">
        <div className="opacity-100">{move.summary}</div>
        <div><MessageCitation messageId={move.messageId} prefix="msg" /> · boundary {move.boundary}</div>
        {move.note ? <div className="opacity-70 whitespace-pre-wrap">{move.note.length > 280 ? `${move.note.slice(0, 279)}…` : move.note}</div> : null}
      </div>
    ))}
  </div>
);

const LivingPanel = lazyRetry(() => import("../LivingPanel"));

const livingActions = (manager: RuntimeManager): LivingActions => ({
  decide: (id, status, edit) => manager.living.decide(id, status, edit),
  regenerate: (id) => manager.living.regenerate(id),
  runNow: () => manager.living.propose(),
  save: (includeUnreached) => manager.living.saveAsStory({ includeUnreached }),
});

const takeAlternate = (manager: RuntimeManager, alternate: string | null | undefined) => (alternate ? manager.activateCheckpoint(alternate) : undefined);

const percent = (value: number) => Math.round(value * 100);

const judgeText = (judge: { contradicts: number; advances: number; newCharacter: number } | undefined) => (judge
  ? `judge: contradicts ${percent(judge.contradicts)}% · advances ${percent(judge.advances)}% · new character ${percent(judge.newCharacter)}%`
  : "");

export const SchedulerTab = ({ snapshot, manager, onOpenFact }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; onOpenFact?: (id: string) => void }) => (
  <div className="flex flex-col gap-3">
    <AuthorMovesPanel snapshot={snapshot} />
    <ChaptersPanel snapshot={snapshot} manager={manager} />
    {snapshot.living?.author ? <LivingPanel view={snapshot.living.author} canSave={snapshot.living.canSave} actions={livingActions(manager)} /> : null}
    <StagecraftPanel snapshot={snapshot} manager={manager} onOpenFact={onOpenFact} />
    <TalkDecisionsPanel snapshot={snapshot} />
    <InnerVoicePanel snapshot={snapshot} />
    <ModelCallsPanel calls={snapshot.modelCalls ?? []} />
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Extraction</div>
      <div>Queue {snapshot.extraction.scheduler.queueDepth}, in flight {snapshot.extraction.scheduler.inFlight ? "yes" : "no"}</div>
      <div>Last read boundary {snapshot.extraction.lastReadBoundary}</div>
      {snapshot.extraction.scheduler.lastError && <div className="text-red-300">{snapshot.extraction.scheduler.lastError}</div>}
      {snapshot.extraction.audits[0] && <div>Last scope: {snapshot.extraction.audits[snapshot.extraction.audits.length - 1]?.scope.join(", ") || "none"}</div>}
      <div>Audits recorded {snapshot.extraction.audits.length}</div>
      {(snapshot.extraction.judgedReads ?? []).length > 0 && (
        <div data-so="judged-reads" className="mt-1">
          <div className="opacity-100">Judged reads</div>
          {[...(snapshot.extraction.judgedReads ?? [])].reverse().slice(0, 5).map((read) => (
            <div key={`${read.at}-${read.kind}`}>
              judge:{read.kind} ·
                boundary {read.boundary} · {read.deltas.length ? read.deltas.map(
                  (delta) => `${delta.q}=${String(delta.v)} (${Math.round(delta.confidence * 100)}%)`,
                ).join(", ") : read.note ?? "no change"}{read.fallback ? ` · fell back (${read.fallback})` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
    <ReconciliationPanel snapshot={snapshot} />
    {snapshot.agencyRecovery && (
      <div data-so="agency-recovery" className="text-xs opacity-80 border-t border-solid border-white/10 pt-1">
        <div className="font-medium opacity-100">Refused route</div>
        <div>The player&apos;s last {snapshot.agencyRecovery.turns} turns were read, and nothing in them moved an exit of {snapshot.agencyRecovery.checkpointName}.</div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {snapshot.agencyRecovery.alternate && (
            <button
              className="menu_button text-xs"
              data-so="agency-take-alternate"
              onClick={() => void takeAlternate(manager, snapshot.agencyRecovery?.alternate)}
            >Take {snapshot.agencyRecovery.alternateName}</button>
          )}
          {snapshot.agencyRecovery.canGenerate && (
            <button className="menu_button text-xs" data-so="agency-generate-road" onClick={() => void manager.runExpansionNow(undefined, true)}>Generate the road ahead</button>
          )}
        </div>
      </div>
    )}
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Expansion</div>
      <div>Queue {snapshot.expansion.scheduler.queueDepth}, in flight {snapshot.expansion.scheduler.inFlight ? "yes" : "no"}</div>
      {snapshot.expansion.scheduler.lastError && <div className="text-red-300">{snapshot.expansion.scheduler.lastError}</div>}
      {Object.values(snapshot.expansion.entries).map((entry) => (
        <div key={entry.key} className="border-t border-solid border-white/10 mt-1 pt-1">
          <div>{entry.stubId} → {entry.targetAnchorId}: {entry.status}{entry.needsReview ? " review" : ""}{entry.origin === "lookahead" ? ` · prepared ahead (${Math.round(
            (entry.headingP ?? 0) * 100,
          )}%)` : ""}</div>
          {(entry.verdicts.at(-1)?.judge || entry.variants) && (
            <div data-so="expansion-judge" className="opacity-80">
              {judgeText(entry.verdicts.at(-1)?.judge)}
              {entry.variants ? ` · ${entry.variants.generated} written, ${entry.variants.survivors} passed code checks, picked #${(entry.variants.picked ?? -1) + 1} by ` +
                `${entry.variants.picker}${entry.variants.pickFallback ? ` (${entry.variants.pickFallback} fell back)` : ""}` : ""}
            </div>
          )}
          <div>{entry.beats.length} beats{entry.lastError ? ` — ${entry.lastError}` : ""}</div>
          {(entry.status === "stale" || entry.status === "failed") && (
            <button data-so="expansion-regenerate" className="menu_button text-xs" onClick={() => { void manager.expansions.regenerate(entry.key); }}>Regenerate</button>
          )}
          {entry.beats.slice(0, 3).map((beat) => <div key={beat.objective}>- {beat.objective}</div>)}
        </div>
      ))}
    </div>
  </div>
);
