import React from "react";
import type { CardArt } from "../../sprites/cardArt";
import { Button } from "@components/ui/Button";

const NOTES: Record<Exclude<CardArt["state"], "accepted">, string> = {
  "not-installed": "No artwork yet. Prepare presentation once this card is created.",
  unprepared: "No accepted artwork yet.",
  stale: "The card changed since its artwork was accepted. Review presentation again.",
};

export default function CardArtView({ name, art, onPrepare }: { name: string; art: CardArt; onPrepare?: () => void }) {
  const label = name.trim() || "This character";
  return <figure data-so="card-art" data-state={art.state} className="flex items-center gap-2 m-0">
    {art.state === "accepted"
      ? <><img src={art.bust} alt={`${label}, accepted bust`} loading="lazy" decoding="async" width={64} height={64} style={{ objectFit: "cover", borderRadius: 4 }} />
        <img src={art.base} alt={`${label}, accepted base`} loading="lazy" decoding="async" height={64} style={{ width: "auto", maxWidth: 48 }} /></>
      : <span aria-hidden="true" className="st-subpanel flex items-center justify-center text-lg" style={{ width: 64, height: 64, borderRadius: 4 }}>
        {label.slice(0, 1).toUpperCase()}</span>}
    <figcaption className="flex flex-col gap-1 text-[11px]">
      <span>{art.state === "accepted" ? `Accepted presentation, revision ${art.revision}${art.pack ? ", with reference views" : ""}.` : NOTES[art.state]}</span>
      {art.state !== "accepted" && art.state !== "not-installed" && onPrepare
        && <Button data-so="card-art-prepare" onClick={onPrepare}>Prepare presentation</Button>}
    </figcaption>
  </figure>;
}
