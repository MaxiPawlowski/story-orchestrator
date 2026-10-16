import type { GateNode } from "./schema";

export const RUMORS_MAX = 24;
export const RUMOR_VERSIONS_MAX = 4;
export const RUMOR_LEAKS_MAX = 4;
export const RUMOR_CLAIM_MAX = 200;
export const GOSSIP_HOPS_DEFAULT = 2;
export const GOSSIP_HOPS_MAX = 3;
export const GOSSIP_DELAY_MAX = 30;
export const RUMOR_TRUTHS = ["true", "false", "unknown"] as const;
export type RumorTruth = (typeof RUMOR_TRUTHS)[number];
export const GOSSIP_CONTACTS = ["together", "any"] as const;
export type GossipContactMode = (typeof GOSSIP_CONTACTS)[number];
export const HEARSAY_STANCES = ["believes", "doubts", "unsure"] as const;
export type HearsayStance = (typeof HEARSAY_STANCES)[number];

export type GossipDelay = { boundaries: [number, number] } | { days: [number, number] };

export interface GossipChannel {
  from: string;
  talks_to: string[];
  contact: GossipContactMode | GateNode;
  when?: GateNode;
  delay: GossipDelay;
  hops: number;
}

export interface RumorVersion {
  text: string;
  truth: RumorTruth;
  weight: number;
}

export interface RumorLeak {
  member: string;
  when: GateNode;
}

export interface Rumor {
  id: string;
  from: string;
  claim: string;
  about?: string[];
  versions?: RumorVersion[];
  starts_when?: GateNode;
  leaks_to?: RumorLeak[];
}

export interface StoryRumors {
  channels: GossipChannel[];
  rumors: Rumor[];
}

declare module "./schema" {
  interface RosterMember {
    gossip?: Record<string, unknown>;
  }
  interface StoryV2 {
    rumors?: Rumor[];
  }
  interface NormalizedStoryV2 {
    rumorNet?: StoryRumors;
  }
}

export const rumorVersions = (rumor: Rumor): RumorVersion[] => (rumor.versions?.length ? rumor.versions : [{ text: rumor.claim, truth: "unknown", weight: 1 }]);
