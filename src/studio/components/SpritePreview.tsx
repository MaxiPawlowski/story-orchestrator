import React from "react";
import type { SpriteCandidate } from "../../sprites/builder/builder";

export default function SpritePreview({ candidate, busy, saved, keep }: { candidate: SpriteCandidate; busy: boolean; saved: boolean; keep(): void }) {
  return <div className="flex flex-col gap-2" data-so="sprite-preview" data-timings={JSON.stringify(candidate.timings ?? {})}>
    <img src={`data:image/png;base64,${candidate.data}`} alt={`${candidate.request.label} preview`} style={{ maxWidth: "min(280px,100%)" }} />
    <p>{candidate.seconds.toFixed(1)} seconds including cleanup. Pixel checks passed. Review identity and expression before saving.</p>
    {candidate.timings && <p className="text-sm">{candidate.timings.cacheHit ? "Raw edit reused; no image job." : `${(candidate.timings.renderMs / 1000).toFixed(1)} seconds rendering.`}</p>}
    {(candidate.rawData || candidate.referenceData) && <details><summary>Inspect the edit before compositing</summary>
      <div className="flex flex-wrap gap-2">
        {candidate.referenceData && <img src={`data:image/png;base64,${candidate.referenceData}`} alt="Reference crop" style={{ maxWidth: "min(240px,100%)" }} />}
        {candidate.rawData && <img src={`data:image/png;base64,${candidate.rawData}`} alt="Raw edit" style={{ maxWidth: "min(240px,100%)" }} />}
      </div>
    </details>}
    <button type="button" className="st-button primary" disabled={busy || saved} onClick={keep}>Keep this sprite</button>
  </div>;
}
