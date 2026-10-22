import type { GateNode } from "./schema";

export const OFFERS_MAX = 8;
export const OFFER_TEXT_MAX = 200;
export const OFFER_REASON_MAX = 120;
export const CHECK_HINT_MAX = 60;

export interface OfferNeeds {
  when: GateNode;
  reason: string;
}

export interface CheckpointOffer {
  id: string;
  text: string;
  visible_when?: GateNode;
  needs?: OfferNeeds;
}

declare module "./schema" {
  interface Checkpoint {
    offers?: CheckpointOffer[];
  }
}
