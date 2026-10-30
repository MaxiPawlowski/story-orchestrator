import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import ChaptersPanel from "../ChaptersPanel";
import ModelCallsPanel from "../ModelCallsPanel";
import InnerVoicePanel from "../InnerVoicePanel";
import { Button } from "@components/ui/Button";

const percent = (value: number) => Math.round(value * 100);

const judgeText = (judge: { contradicts: number; advances: number; newCharacter: number } | undefined) => (judge
  ? `judge: contradicts ${percent(judge.contradicts)}% · advances ${percent(judge.advances)}% · new character ${percent(judge.newCharacter)}%`
  : "");

export const PipelineSection = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => (
  <div className="so-console-stack">
    <ModelCallsPanel calls={snapshot.modelCalls ?? []} />
    <div className="so-console-block">
      <h4>Extraction</h4>
      <div>Queue {snapshot.extraction.scheduler.queueDepth}, in flight {snapshot.extraction.scheduler.inFlight ? "yes" : "no"}</div>
      <div>Last read boundary {snapshot.extraction.lastReadBoundary}</div>
      {snapshot.extraction.scheduler.lastError && <div className="so-error-text">{snapshot.extraction.scheduler.lastError}</div>}
      {snapshot.extraction.audits[0] && <div>Last scope: {snapshot.extraction.audits[snapshot.extraction.audits.length - 1]?.scope.join(", ") || "none"}</div>}
      <div>Audits recorded {snapshot.extraction.audits.length}</div>
      {(snapshot.extraction.judgedReads ?? []).length > 0 && (
        <div data-so="judged-reads" className="mt-1">
          <div className="so-strong">Judged reads</div>
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
    <div className="so-console-block">
      <h4>Expansion</h4>
      <div>Queue {snapshot.expansion.scheduler.queueDepth}, in flight {snapshot.expansion.scheduler.inFlight ? "yes" : "no"}</div>
      {snapshot.expansion.scheduler.lastError && <div className="so-error-text">{snapshot.expansion.scheduler.lastError}</div>}
      {Object.values(snapshot.expansion.entries).map((entry) => (
        <div key={entry.key} className="so-console-item">
          <div>{entry.kind === "encounters" ? `${entry.stubId} encounters` : `${entry.stubId} → ${entry.targetAnchorId}`}: {entry.status}
            {entry.needsReview ? " review" : ""}{entry.origin === "lookahead" ? ` · prepared ahead (${Math.round(
            (entry.headingP ?? 0) * 100,
          )}%)` : ""}</div>
          {(entry.verdicts.at(-1)?.judge || entry.variants) && (
            <div data-so="expansion-judge" className="so-muted">
              {judgeText(entry.verdicts.at(-1)?.judge)}
              {entry.variants ? ` · ${entry.variants.generated} written, ${entry.variants.survivors} passed code checks, picked #${(entry.variants.picked ?? -1) + 1} by ` +
                `${entry.variants.picker}${entry.variants.pickFallback ? ` (${entry.variants.pickFallback} fell back)` : ""}` : ""}
            </div>
          )}
          <div>{entry.kind === "encounters" ? `${entry.encounters?.length ?? 0} encounters` : `${entry.beats.length} beats`}{entry.lastError ? ` — ${entry.lastError}` : ""}</div>
          {(entry.status === "stale" || entry.status === "failed" || (entry.kind === "encounters" && entry.status === "needs_review")) && (
            <Button size="sm" data-so="expansion-regenerate" onClick={() => { void manager.expansions.regenerate(entry.key); }}>Regenerate</Button>
          )}
          {entry.beats.slice(0, 3).map((beat) => <div key={beat.objective}>- {beat.objective}</div>)}
          {(entry.encounters ?? []).map((encounter) => <div key={encounter.id} data-so="encounter-row">- {encounter.title}</div>)}
        </div>
      ))}
    </div>
    <InnerVoicePanel snapshot={snapshot} />
    <ChaptersPanel snapshot={snapshot} manager={manager} />
  </div>
);
