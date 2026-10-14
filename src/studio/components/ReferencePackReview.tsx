import React from "react";
import { REFERENCE_VIEWS, type VisualManifest } from "../../sprites/visualManifest";
import { VIEW_LABELS, type ReferencePackReview as Review } from "../../sprites/referenceViews";

export default function ReferencePackReview({ source, review, busy, progress, error, prepare, accept, cancel }: {
  source?: VisualManifest; review?: Review | null; busy: boolean; progress?: { done: number; total: number } | null; error?: string | null;
  prepare(): void; accept(): void; cancel(): void;
}) {
  const pack = source?.pack;
  return <section id="so-reference-pack" aria-label="Reference views" className="flex flex-col gap-2 st-subpanel p-3">
    <h3>Reference views</h3>
    <p>Optional. Draws three-quarter left and right, profile and back views from the accepted base; the base and bust fill the full-body and front slots.
      Accepting stamps the pack into every later sprite, pose and scene key, so looks render again under it.</p>
    {!source && <p role="status">Accept a base and bust above before preparing reference views.</p>}
    {source && <button type="button" className="st-button" disabled={busy} onClick={prepare}>{pack ? "Draw the reference views again" : "Draw reference views"}</button>}
    {busy && <p role="status">{progress ? `Drawing view ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : "Preparing or saving reference views…"}</p>}
    {(busy || review) && <button type="button" className="st-button" onClick={cancel}>Cancel reference views</button>}
    {error && <p role="alert">{error}</p>}
    {review && source && <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <figure><img src={source.base.path} alt="Full body view" loading="lazy" style={{ maxWidth: 120 }} /><figcaption>{VIEW_LABELS.full_body}</figcaption></figure>
        <figure><img src={source.bust.path} alt="Front bust view" loading="lazy" style={{ maxWidth: 120 }} /><figcaption>{VIEW_LABELS.front}</figcaption></figure>
        {review.views.map((view) => <figure key={view.view}>
          <img src={`data:image/png;base64,${view.data}`} alt={`${VIEW_LABELS[view.view]} view to approve`} style={{ maxWidth: 120 }} />
          <figcaption>{VIEW_LABELS[view.view]}</figcaption></figure>)}
      </div>
      <button type="button" className="st-button" disabled={busy} onClick={accept}>Accept all six views</button>
    </div>}
    {pack && !review && <div className="flex flex-col gap-1">
      <p role="status">Reference pack {pack.hash.slice(0, 12)} accepted on source revision {source?.revision}.</p>
      <ul className="flex flex-wrap gap-2" aria-label="Accepted reference views">
        {REFERENCE_VIEWS.map((view) => <li key={view}><img src={pack.views[view].path} alt={`${VIEW_LABELS[view]} reference`} loading="lazy" style={{ maxWidth: 72 }} /></li>)}
      </ul>
    </div>}
    {source && !pack && !review && !busy && <p role="status">No reference pack. Sprites and poses use the accepted base alone.</p>}
  </section>;
}
