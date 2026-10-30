import React, { useState } from "react";
import type { Checkpoint, Quality } from "@engine/index";
import { OFFER_REASON_MAX, OFFER_TEXT_MAX, OFFERS_MAX, type CheckpointOffer } from "@engine/offerSchema";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { useDraftStore } from "../draft";
import { addOffer, moveOffer, removeOffer, setOffers, updateOffer } from "../mutations";
import { JsonField, OptionalGate } from "./GameFields";
import "../mobile.css";

const OFFERS_HINT = '[{"id", "text", "visible_when"?, "needs"?: {"when", "reason"}}], at most 8';

const OfferRow = ({ checkpoint, offer, index, count, qualities }: { checkpoint: Checkpoint; offer: CheckpointOffer; index: number; count: number; qualities: Quality[] }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const patch = (change: Partial<CheckpointOffer>) => mutate((current) => updateOffer(current, checkpoint.id, offer.id, change));
  const label = `Offer ${index + 1}`;
  return (
    <li data-so="offer-row" data-offer={offer.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-xs st-muted">{label} — what the player could do</span>
          <input className="text_pole st-input" aria-label={`${label} text`} maxLength={OFFER_TEXT_MAX} placeholder="e.g. Ask about the debt" value={offer.text}
            onChange={(event) => patch({ text: event.target.value })} />
        </label>
        <IconButton icon="fa-arrow-up" size="sm" label={`Move ${label} up`} disabled={index === 0} onClick={() => mutate((current) => moveOffer(current, checkpoint.id, offer.id, -1))} />
        <IconButton icon="fa-arrow-down" size="sm" label={`Move ${label} down`} disabled={index === count - 1} onClick={() => mutate((current) => moveOffer(current, checkpoint.id, offer.id, 1))} />
        <IconButton icon="fa-trash" size="sm" variant="danger" label={`Remove ${label}`} onClick={() => mutate((current) => removeOffer(current, checkpoint.id, offer.id))} />
      </div>
      <OptionalGate label={`${label} only shown when`} gate={offer.visible_when} qualities={qualities} onChange={(visible_when) => patch({ visible_when })} />
      <OptionalGate label={`${label} needs`} gate={offer.needs?.when} qualities={qualities}
        onChange={(when) => patch({ needs: when ? { when, reason: offer.needs?.reason ?? "" } : undefined })} />
      {offer.needs && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Shown greyed with this reason while the need is unmet</span>
          <input className="text_pole st-input" aria-label={`${label} needs reason`} maxLength={OFFER_REASON_MAX} placeholder="e.g. You need the key first"
            value={offer.needs.reason} onChange={(event) => patch({ needs: { when: offer.needs?.when ?? { all: [] }, reason: event.target.value } })} />
        </label>
      )}
    </li>
  );
};

const OffersEditor = ({ checkpoint, qualities }: { checkpoint: Checkpoint; qualities: Quality[] }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const [json, setJson] = useState(false);
  const offers = checkpoint.offers ?? [];
  return (
    <div data-so="offers-editor" className="flex flex-col gap-2">
      <p className="m-0 text-xs st-muted">Choices listed under “What could I do?” while the story is here. At most {OFFERS_MAX}.</p>
      {json ? (
        <JsonField label="Offers as JSON" hint={OFFERS_HINT} value={checkpoint.offers}
          onChange={(value) => mutate((current) => setOffers(current, checkpoint.id, Array.isArray(value) ? (value as CheckpointOffer[]) : undefined))} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Offers">
          {offers.map((offer, index) => <OfferRow key={offer.id} checkpoint={checkpoint} offer={offer} index={index} count={offers.length} qualities={qualities} />)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!json && <Button icon="fa-plus" size="sm" disabled={offers.length >= OFFERS_MAX} onClick={() => mutate((current) => addOffer(current, checkpoint.id))}>Add offer</Button>}
        <Button size="sm" variant="ghost" icon={json ? "fa-list" : "fa-code"} aria-pressed={json} data-so="offers-json-toggle" onClick={() => setJson(!json)}>
          {json ? "Edit as rows" : "Edit as JSON"}
        </Button>
      </div>
    </div>
  );
};

export default OffersEditor;
