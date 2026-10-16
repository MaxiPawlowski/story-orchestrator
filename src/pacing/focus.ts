export type FocusKind = "arc" | "member";

export interface FocusCandidate {
  kind: FocusKind;
  text: string;
}

export interface FocusSources {
  arcs: readonly string[];
  members?: ReadonlyArray<{ name: string; present: boolean }>;
  unknownNames: readonly string[];
  resting?: (text: string) => string;
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const namesAny = (text: string, names: readonly string[]): boolean =>
  names.map((name) => name.trim()).filter(Boolean).some((name) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(name)}($|[^\\p{L}\\p{N}])`, "iu").test(text));

export function focusCandidates(sources: FocusSources): FocusCandidate[] {
  const resting = sources.resting ?? ((text: string) => text);
  const seen = new Set<string>();
  const keep = (kind: FocusKind, raw: string): FocusCandidate[] => {
    const text = resting(raw).trim();
    if (!text || resting(text).trim() !== text || namesAny(text, sources.unknownNames) || seen.has(`${kind}:${text}`)) return [];
    seen.add(`${kind}:${text}`);
    return [{ kind, text }];
  };
  return [
    ...sources.arcs.flatMap((arc) => keep("arc", arc)),
    ...(sources.members ?? []).filter((member) => member.present).flatMap((member) => keep("member", member.name)),
  ];
}

export const focusSafe = (text: string, unknownNames: readonly string[], resting?: (text: string) => string): boolean =>
  focusCandidates({ arcs: [text], unknownNames, ...(resting ? { resting } : {}) })[0]?.text === text.trim();

export const focusPick = (candidates: readonly FocusCandidate[], unit: number): FocusCandidate | null =>
  (candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(Math.max(0, unit) * candidates.length))] : null);
