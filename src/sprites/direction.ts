import { isRecord } from "@utils/guards";

export type Framing = "full" | "thigh" | "close";

export const FRAMINGS: readonly Framing[] = ["full", "thigh", "close"];

export interface MemberDirection {
  set?: string;
  face?: string;
  hidden?: boolean;
}

export interface StageDirection {
  framing: Framing | null;
  spotlight: string | null;
  cast: Record<string, MemberDirection>;
}

export interface FigureBox {
  top: number;
  bottom: number;
}

export interface Slice {
  scale: number;
  offset: number;
}

const FRAME_SHARE: Record<Framing, number> = { full: 1, thigh: 0.6, close: 0.3 };
const HEADROOM = 0.04;
const ID = /^[a-z0-9_]+$/;

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

export function readStageDirection(value: unknown): StageDirection | null {
  if (!isRecord(value)) return null;
  const framing = FRAMINGS.find((option) => option === value.framing) ?? null;
  const cast: Record<string, MemberDirection> = {};
  if (isRecord(value.cast)) {
    for (const [name, raw] of Object.entries(value.cast)) {
      const key = name.trim().toLowerCase();
      if (!key || !isRecord(raw)) continue;
      const set = text(raw.set);
      const face = text(raw.face);
      const entry: MemberDirection = {
        ...(set && ID.test(set) ? { set } : {}),
        ...(face && ID.test(face) ? { face } : {}),
        ...(raw.hidden === true ? { hidden: true } : {}),
      };
      if (Object.keys(entry).length) cast[key] = entry;
    }
  }
  const spotlight = text(value.spotlight)?.toLowerCase() ?? null;
  if (!framing && !spotlight && !Object.keys(cast).length) return null;
  return { framing, spotlight, cast };
}

export function directionKeys(name: string, aliases: readonly string[] = []): string[] {
  return [name, ...aliases].map((key) => key.trim().toLowerCase()).filter(Boolean);
}

export function memberDirection(direction: StageDirection | null, keys: readonly string[]): MemberDirection {
  if (!direction) return {};
  for (const key of keys) {
    const entry = direction.cast[key];
    if (entry) return entry;
  }
  return {};
}

export function isSpotlit(direction: StageDirection | null, keys: readonly string[]): boolean {
  return Boolean(direction?.spotlight && keys.includes(direction.spotlight));
}

export interface Standing {
  keys: readonly string[];
  muted: boolean;
  speaking: boolean;
}

export const directsCast = (direction: StageDirection | null): boolean =>
  Boolean(direction && Object.values(direction.cast).some((entry) => !entry.hidden));

export function standsOnStage(actor: Standing, direction: StageDirection | null): boolean {
  const directed = memberDirection(direction, actor.keys);
  if (directed.hidden) return false;
  const named = Object.keys(directed).length > 0 || isSpotlit(direction, actor.keys);
  if (actor.muted) return named;
  return !directsCast(direction) || named || actor.speaking;
}

export function frameSlice(framing: Framing, box: FigureBox | null): Slice {
  if (framing === "full" || !box || box.bottom <= box.top) return { scale: 1, offset: 0 };
  const top = Math.max(0, box.top - HEADROOM);
  const shown = (box.bottom - box.top) * FRAME_SHARE[framing] + (box.top - top);
  const scale = 1 / Math.max(shown, 0.05);
  return { scale, offset: top * scale };
}

export function figureBox(alpha: ArrayLike<number>, width: number, height: number, threshold = 16): FigureBox | null {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    let filled = false;
    for (let x = 0; x < width; x += 1) {
      if (alpha[(y * width + x) * 4 + 3] > threshold) {
        filled = true;
        break;
      }
    }
    if (!filled) continue;
    if (top < 0) top = y;
    bottom = y + 1;
  }
  return top < 0 ? null : { top: top / height, bottom: bottom / height };
}
