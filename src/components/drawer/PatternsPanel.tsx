import type { PatternAuthorSlice } from "@runtime/patternsPort";

const GAPS: Record<string, string> = { kit: "did not load", off: "switched off", history: "history no longer kept" };

const REASONS: Record<string, string> = { unless: "cancelled", expired: "expired", overflow: "dropped (too many at once)" };

export const PatternsPanel = ({ slice }: { slice: PatternAuthorSlice }) => (
  <details id="so-author-patterns" data-so="patterns" className="text-xs opacity-80">
    <summary className="font-medium opacity-100 cursor-pointer">Patterns ({slice.live.length} in progress, {slice.completed.length} completed)</summary>
    {slice.live.map((row, index) => (
      <div key={`live-${row.patternId}-${index}`} data-so="pattern-live" data-pattern={row.patternId} className="mt-1">
        {row.patternId}: step {row.next} of {row.of} · next {row.nextStep}{row.bindings ? ` · ${row.bindings}` : ""}
        <div className="opacity-70">{row.refs.join(" → ")}</div>
      </div>
    ))}
    {slice.completed.map((row, index) => (
      <div key={`done-${row.patternId}-${index}`} data-so="pattern-completed" data-pattern={row.patternId} data-withheld={row.withheld ? "true" : undefined} className="mt-1">
        {row.patternId} completed at turn {row.boundary}{row.text ? `: ${row.text}` : ""}{row.withheld ? " (withheld from the player now)" : ""}
        <div className="opacity-70">{row.refs.join(" → ")}</div>
      </div>
    ))}
    {slice.ended.map((row, index) => (
      <div key={`end-${row.patternId}-${index}`} data-so="pattern-ended" className="mt-1 opacity-70">{row.patternId} {REASONS[row.reason] ?? row.reason} at {row.at} (after step {row.next})</div>
    ))}
    {(slice.overflow > 0 || slice.withheldSecret > 0) && (
      <div className="mt-1">
        {slice.overflow ? `${slice.overflow} partial match(es) dropped over the cap. ` : ""}
        {slice.withheldSecret ? `${slice.withheldSecret} line(s) withheld: they restate a secret.` : ""}
      </div>
    )}
    {slice.gaps.map((gap, index) => (
      <div key={`gap-${index}`} data-so="pattern-gap" className="mt-1">Not matched: turns {gap.from}–{gap.to} ({GAPS[gap.reason]})</div>
    ))}
    {slice.partial.length > 0 && <div className="mt-1">Edited since play began, partial history: {slice.partial.join(", ")}</div>}
  </details>
);
