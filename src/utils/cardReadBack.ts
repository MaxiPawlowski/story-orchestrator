import { isRecord } from "./guards";

export type CardReadBackState = "stored" | "unconfirmed" | "mismatch";

export interface CardReadBack {
  state: CardReadBackState;
  lossy: string[];
  name: string | null;
}

export interface CardReadBackRecord {
  state: CardReadBackState;
  lossy: string[];
  avatar: string;
}

export const CARD_READBACK_FIELDS = ["name", "description", "personality", "scenario", "first_mes", "mes_example"] as const;

export type CardReadBackField = typeof CARD_READBACK_FIELDS[number];

export type SentCard = Record<CardReadBackField, string>;

export interface ReadBackAnswer {
  ok: boolean;
  body: unknown;
}

const UNCONFIRMED: CardReadBack = { state: "unconfirmed", lossy: [], name: null };

const same = (a: string, b: string) => a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");

const storedField = (body: Record<string, unknown>, field: CardReadBackField): string | null => {
  const data = isRecord(body.data) ? body.data : {};
  const value = typeof body[field] === "string" ? body[field] : data[field];
  return typeof value === "string" ? value : null;
};

export const cardReadBack = (sent: SentCard, answer: ReadBackAnswer | null): CardReadBack => {
  if (!answer?.ok || !isRecord(answer.body)) return UNCONFIRMED;
  const body = answer.body;
  const name = storedField(body, "name");
  if (name === null) return UNCONFIRMED;
  const lossy = CARD_READBACK_FIELDS.filter((field) => !same(storedField(body, field) ?? "", sent[field]));
  return { state: lossy.length ? "mismatch" : "stored", lossy, name };
};

export const describeReadBack = (name: string, readBack: Pick<CardReadBackRecord, "state" | "lossy">): string => {
  if (readBack.state === "stored") return `Created the character card "${name}".`;
  if (readBack.state === "mismatch") {
    return `Created the character card "${name}", but SillyTavern stored ${readBack.lossy.join(", ")} differently from what was sent. Check the card; it is never created again.`;
  }
  return `Asked SillyTavern to create the character card "${name}", but could not read it back, so it may exist. It is never created again; check again later.`;
};
