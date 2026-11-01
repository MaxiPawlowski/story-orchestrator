export interface InChatDivider {
  time: string | null;
  scene: boolean;
}

export interface InChatDiscovery {
  key: string;
  page: "people" | "places";
  name: string;
  first: boolean;
  facts: string[];
}

export interface InChatMeterRow {
  toName: string;
  met: number;
  total: number;
  ready: boolean;
  open: string[];
}

export interface InChatMeter {
  rows: InChatMeterRow[];
  moved: string | null;
}

export interface InChatOffer {
  key: string;
  text: string;
}

export interface InChatChips {
  messageId: number;
  yours: boolean;
  offers: InChatOffer[];
  ideas: boolean;
}

export interface InChatView {
  player: boolean;
  author: boolean;
  dividers: Record<number, InChatDivider>;
  because: Record<number, string[]>;
  discovery: Record<number, InChatDiscovery[]>;
  meter: Record<number, InChatMeter>;
  chips: InChatChips | null;
}

export const EMPTY_IN_CHAT: InChatView = { player: false, author: false, dividers: {}, because: {}, discovery: {}, meter: {}, chips: null };
