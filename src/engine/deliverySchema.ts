export const DELIVERY_RHYTHMS = ["clipped", "plain", "flowing", "ornate"] as const;
export type DeliveryRhythm = (typeof DELIVERY_RHYTHMS)[number];

export const DELIVERY_DIALOGUE = ["keep", "voice"] as const;
export type DeliveryDialogue = (typeof DELIVERY_DIALOGUE)[number];

export interface DeliverySheet {
  notes?: string;
  prefer?: string[];
  avoid?: string[];
  tics?: string[];
  rhythm?: DeliveryRhythm;
  by_mood?: Record<string, string>;
}

export interface RosterPolish extends DeliverySheet {
  dialogue?: DeliveryDialogue;
  enabled?: boolean;
}

export type NarrationSheet = Omit<DeliverySheet, "by_mood">;

export const DELIVERY_CAPS = {
  notes: 300,
  prefer: { items: 12, chars: 40 },
  avoid: { items: 20, chars: 40 },
  tics: { items: 12, chars: 40 },
  byMood: 160,
} as const;

export const DELIVERY_TOKEN_CAP = 120;

export const DELIVERY_SHEET_KEYS = ["notes", "prefer", "avoid", "tics", "rhythm", "by_mood"] as const;
export const ROSTER_POLISH_KEYS = [...DELIVERY_SHEET_KEYS, "dialogue", "enabled"] as const;
export const NARRATION_SHEET_KEYS = ["notes", "prefer", "avoid", "tics", "rhythm"] as const;

export const polishOn = (polish: RosterPolish | undefined): polish is RosterPolish => Boolean(polish) && polish?.enabled !== false;
