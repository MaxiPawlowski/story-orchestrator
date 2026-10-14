import React from "react";
import type { VisualReview } from "../../sprites/visualPreparation";
import type { VisualManifest } from "../../sprites/visualManifest";

export default function PresentationReview({ review, accepted, busy, error, stale = false, prepare, accept, cancel }: {
  review?: VisualReview | null; accepted?: VisualManifest; busy: boolean; error?: string | null; stale?: boolean;
  prepare(): void; accept(): void; cancel(): void;
}) {
  return <section id="so-prepare-presentation" aria-label="Prepare presentation" className="flex flex-col gap-2 st-subpanel p-3">
    <h3>Prepare presentation</h3>
    <p>Keep a base candidate or select an installed base, adjust its head box, then review both images. Transparency checks do not approve identity.</p>
    <button type="button" className="st-button" disabled={busy} onClick={prepare}>Review selected base and bust</button>
    {busy && <p role="status">Preparing or saving reviewed artwork…</p>}
    {(busy || review) && <button type="button" className="st-button" onClick={cancel}>Cancel presentation review</button>}
    {error && <p role="alert">{error}</p>}
    {stale && <p role="status">The changed look needs its own bust and rig. Static artwork is used until rebuilt.</p>}
    {review && <div className="flex flex-wrap gap-3">
      <figure><img src={review.input.base.path} alt="Base to approve" style={{ maxWidth: 180 }} /><figcaption>Selected base</figcaption></figure>
      <figure><img src={`data:image/png;base64,${review.data}`} alt="Bust to approve" style={{ maxWidth: 180 }} /><figcaption>Bust from the head box</figcaption></figure>
      <button type="button" className="st-button" disabled={busy} onClick={accept}>Accept base and bust identity</button>
    </div>}
    {accepted && <p role="status">Accepted source revision {accepted.revision}. Expressions and poses use this lineage. Live head awaits a matching rig.</p>}
    {!accepted && !review && <p role="status">No artwork accepted for presentation yet. Build or choose a neutral base first.</p>}
  </section>;
}
