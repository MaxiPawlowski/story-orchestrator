import React from "react";
import type { ChangedLookRow, LookRebuildReview } from "../../sprites/lookRebuild";
import type { LandmarkCrossCheck } from "../../sprites/liveHead/synthesis/landmarkCheck";

function LandmarkCheckNote({ check }: { check?: LandmarkCrossCheck }) {
  if (!check) return null;
  if (check.status !== "disagree") return <p data-so="landmark-check" data-status={check.status} className="text-sm opacity-80">{check.note}</p>;
  return <div data-so="landmark-check" data-status="disagree" role="alert"><p>{check.note}</p>
    <ul>{check.warnings.map((warning, index) => <li key={index} data-feature={warning.feature}>{warning.message}</li>)}</ul></div>;
}

const lookName = (look: string): string => look === "default" ? "accepted look" : look;

export default function ChangedLookReview({ rows, review, busy, error, notice, rebuild, accept, cancel, preview }: {
  rows: ChangedLookRow[]; review?: LookRebuildReview | null; busy: boolean; error?: string | null; notice?: string | null;
  rebuild(look: string): void; accept(): void; cancel(): void; preview?: React.ReactNode;
}) {
  return <section id="so-changed-look-rebuild" aria-label="Changed-look bust and rig" className="flex flex-col gap-2 st-subpanel p-3">
    <h3>Changed-look bust and rig</h3>
    <p>A changed look keeps static artwork in close shots until its bust and rig match the new artwork.
      Rebuilding expands the accepted head box to retain the chin, shoulders and upper torso, then prepares a rig from face landmarks; nothing is saved until you accept.</p>
    {!rows.length && !review && <p role="status">Every published look has a matching bust and rig.</p>}
    {!!rows.length && <ul className="flex flex-col gap-2">{rows.map((row) => <li key={row.look} data-so="changed-look-row" className="flex flex-wrap gap-2 items-center">
      <img src={row.base.path} alt={`Current artwork for ${lookName(row.look)}`} style={{ maxWidth: 64 }} />
      <span>{lookName(row.look)}: {row.state === "pending-bust" ? "bust and rig are stale" : "rig is missing"}; static artwork until rebuilt.</span>
      <button type="button" className="st-button" disabled={busy} aria-label={`Rebuild bust and rig for ${lookName(row.look)}`} onClick={() => rebuild(row.look)}>
        Rebuild bust and rig</button>
    </li>)}</ul>}
    {busy && <p role="status">Rebuilding or saving the look…</p>}
    {(busy || review) && <button type="button" className="st-button" onClick={cancel}>Cancel rebuild</button>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {review && <div className="flex flex-wrap gap-3" data-so="changed-look-review">
      <figure><img src={review.base.path} alt="Changed look to rebuild" style={{ maxWidth: 160 }} /><figcaption>Changed look</figcaption></figure>
      <figure><img src={review.bust.path ?? `data:image/png;base64,${review.bust.data ?? ""}`} alt="Rebuilt bust to approve" style={{ maxWidth: 160 }} />
        <figcaption>{review.bust.path ? "Saved bust (kept)" : "Bust from the accepted head box"}</figcaption></figure>
      {review.rig ? <div className="flex flex-col gap-1"><p role="status">Rig prepared from face landmarks. Check blinking and talking before accepting.</p>
        <LandmarkCheckNote check={review.rigCheck} />{preview}</div>
        : <p role="status">Rig not prepared: {review.rigError ?? "no landmarks"}. Accepting keeps the bust; close shots stay static.</p>}
      <button type="button" className="st-button" disabled={busy} onClick={accept}>{review.rig ? "Accept rebuilt bust and rig" : "Accept rebuilt bust only"}</button>
    </div>}
  </section>;
}
