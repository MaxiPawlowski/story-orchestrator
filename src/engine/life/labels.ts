import { evaluateGate, gateKeys, renderGateText } from "../gates";
import {
  RELATIONSHIP_TOWARD_PLAYER, hasLabels, labelNextKey, labelShownKey, labelSinceKey, revealKey,
  type NormalizedStory, type PrimitiveValue, type RelationshipDecl, type SecretLabel,
} from "../schema";
import type { BoundaryLogEntry } from "../engine";
import { knownEntities } from "../codex";

type Read = Readonly<Record<string, unknown>>;
type Write = { q: string; v: PrimitiveValue };
type Names = Readonly<Record<string, string>>;

export const LABEL_COPY = {
  you: "you",
  toward: (name: string) => `Toward ${name}`,
  learned: (label: string, toward: string | null) => (toward ? `Learned (toward ${toward}): ${label}` : `Learned: ${label}`),
  reveal: (holder: string, label: string, toward: string | null) => (toward ? `${holder} toward ${toward}: ${label}` : `${holder}: ${label}`),
  chip: (text: string) => `Revealed · ${text}`,
};

export interface LabelledRelationship {
  member: string;
  relationship: RelationshipDecl;
}

export interface LabelRow {
  kind: "label" | "learned";
  text: string;
  at: number | null;
}

export interface RevealEvent {
  boundary: number;
  messageId: number;
  text: string;
}

export interface LabelAuthorRow {
  member: string;
  toward: string;
  shown: string | null;
  public: Array<{ label: string; gate: string | null; holds: boolean; follows: boolean; hold: number | null }>;
  secrets: Array<{ id: string; label: string; gate: string; boundary: number | null; messageId: number | null }>;
}

const reader = (values: Read) => ({ get: (key: string) => values[key] as PrimitiveValue | undefined });

export const labelledRelationships = (story: Pick<NormalizedStory, "life">): LabelledRelationship[] =>
  (story.life?.members ?? []).flatMap((member) => member.relationships.filter(hasLabels).map((relationship) => ({ member: member.id, relationship })));

const holdingRow = (relationship: RelationshipDecl, values: Read, eventsOnly = false): number => {
  const rows = relationship.public ?? [];
  for (let at = rows.length - 1; at >= 0; at -= 1) {
    const when = rows[at].when;
    if (eventsOnly && rows[at].follows_feeling) continue;
    if (!when || evaluateGate(when, reader(values))) return at;
  }
  return -1;
};

const usesHold = (relationship: RelationshipDecl): boolean => Boolean(relationship.public?.some((row) => row.hold));

export const shownLabelRow = (member: string, relationship: RelationshipDecl, values: Read): number => {
  if (!usesHold(relationship)) return holdingRow(relationship, values);
  const stored = values[labelShownKey(member, relationship.toward)];
  return typeof stored === "number" ? stored : holdingRow(relationship, values, true);
};

export const shownLabel = (member: string, relationship: RelationshipDecl, values: Read): string | null =>
  relationship.public?.[shownLabelRow(member, relationship, values)]?.label ?? null;

export const revealedAt = (member: string, relationship: RelationshipDecl, secret: SecretLabel, values: Read): number | null => {
  const value = values[revealKey(member, relationship.toward, secret.id)];
  return typeof value === "number" ? value : null;
};

const holdWrites = (member: string, relationship: RelationshipDecl, view: { boundary: number; values: Read }): Write[] => {
  const shownKey = labelShownKey(member, relationship.toward);
  const nextKey = labelNextKey(member, relationship.toward);
  const target = holdingRow(relationship, view.values);
  const stored = view.values[shownKey];
  const shown = typeof stored === "number" ? stored : holdingRow(relationship, view.values, true);
  const settle = typeof stored === "number" ? [] : [{ q: shownKey, v: shown }];
  const next = view.values[nextKey];
  if (target === shown) return [...settle, ...(next === undefined || next === shown ? [] : [{ q: nextKey, v: shown }])];
  const since = view.values[labelSinceKey(member, relationship.toward)];
  const started = next === target && typeof since === "number" ? since : view.boundary;
  const need = relationship.public?.[target]?.hold ?? relationship.public?.[shown]?.hold ?? 1;
  const waiting = next === target ? [] : [{ q: nextKey, v: target }, { q: labelSinceKey(member, relationship.toward), v: view.boundary }];
  return view.boundary - started + 1 >= need ? [...waiting, { q: shownKey, v: target }] : [...settle, ...waiting];
};

const revealWrites = (member: string, relationship: RelationshipDecl, view: { boundary: number; values: Read }): Write[] => (relationship.secret ?? [])
  .filter((secret) => revealedAt(member, relationship, secret, view.values) === null && evaluateGate(secret.revealed_when, reader(view.values)))
  .map((secret) => ({ q: revealKey(member, relationship.toward, secret.id), v: view.boundary }));

export const labelLatches = (story: Pick<NormalizedStory, "life">, view: { boundary: number; values: Read }): Write[] =>
  labelledRelationships(story).flatMap(({ member, relationship }) => [
    ...revealWrites(member, relationship, view),
    ...(usesHold(relationship) ? holdWrites(member, relationship, view) : []),
  ]);

export const labelDiscoveryUnits = (story: Pick<NormalizedStory, "life">, values: Read): { entries: string[][]; facts: string[][] } => ({
  entries: [],
  facts: labelledRelationships(story).flatMap(({ member, relationship }) => [
    ...(relationship.secret ?? []).filter((secret) => revealedAt(member, relationship, secret, values) === null).map((secret) => gateKeys(secret.revealed_when)),
    ...(relationship.public ?? []).flatMap((row) => (row.when ? [gateKeys(row.when)] : [])),
  ]).map((keys) => keys.filter((key) => !key.startsWith("rel_"))).filter((keys) => keys.length > 0),
});

const nameOf = (story: Pick<NormalizedStory, "roster">, names: Names, id: string): string => names[id] ?? story.roster.find((member) => member.id === id)?.name ?? id;

const towardName = (story: Pick<NormalizedStory, "roster">, names: Names, toward: string): string | null =>
  (toward === RELATIONSHIP_TOWARD_PLAYER ? null : nameOf(story, names, toward));

const visible = (known: ReadonlySet<string>, member: string, toward: string): boolean =>
  known.has(member) && (toward === RELATIONSHIP_TOWARD_PLAYER || known.has(toward));

export const holderLabelRows = (
  story: Pick<NormalizedStory, "life" | "roster">, values: Read, holder: string, known: ReadonlySet<string>, names: Names, toward: (id: string) => boolean = () => true,
): LabelRow[] => labelledRelationships(story).filter(({ member, relationship }) => member === holder && visible(known, member, relationship.toward) && toward(relationship.toward))
  .flatMap(({ member, relationship }) => {
    const label = shownLabel(member, relationship, values);
    const toward = towardName(story, names, relationship.toward);
    const learned = (relationship.secret ?? []).flatMap((secret): LabelRow[] => {
      const at = revealedAt(member, relationship, secret, values);
      return at === null ? [] : [{ kind: "learned", text: LABEL_COPY.learned(secret.label, toward), at }];
    });
    return [...(label ? [{ kind: "label" as const, text: `${LABEL_COPY.toward(toward ?? LABEL_COPY.you)}: ${label}`, at: null }] : []), ...learned];
  });

export const labelHolders = (story: Pick<NormalizedStory, "life">): string[] => [...new Set(labelledRelationships(story).map(({ member }) => member))];

export const revealEvents = (
  story: NormalizedStory, log: readonly BoundaryLogEntry[], values: Read, enabled: readonly string[], names: Names,
): RevealEvent[] => {
  const known = knownEntities(story, values, enabled).members;
  const pairs = labelledRelationships(story).filter(({ member, relationship }) => visible(known, member, relationship.toward));
  return log.flatMap((entry) => pairs.flatMap(({ member, relationship }) => (relationship.secret ?? [])
    .filter((secret) => revealedAt(member, relationship, secret, entry.before.blackboard.values) === null && revealedAt(member, relationship, secret, entry.after.blackboard.values) !== null)
    .map((secret) => ({
      boundary: entry.boundary, messageId: entry.context.lastMessageId,
      text: LABEL_COPY.reveal(nameOf(story, names, member), secret.label, towardName(story, names, relationship.toward)),
    }))));
};

export const revealChips = (story: NormalizedStory, log: readonly BoundaryLogEntry[], values: Read, enabled: readonly string[], names: Names): RevealEvent[] =>
  revealEvents(story, log, values, enabled, names).map((event) => ({ ...event, text: LABEL_COPY.chip(event.text) }));

export const labelClause = (member: string, relationship: RelationshipDecl, values: Read): string => {
  const shown = shownLabel(member, relationship, values);
  const secrets = (relationship.secret ?? []).map((secret) =>
    `${secret.label}, ${revealedAt(member, relationship, secret, values) === null ? "which others have not learned" : "which the player now knows"}`);
  const parts = [...(shown ? [`shown as: ${shown}`] : []), ...(secrets.length ? [`secretly: ${secrets.join("; ")}`] : [])];
  return parts.length ? ` (${parts.join("; ")})` : "";
};

const messageAt = (log: readonly BoundaryLogEntry[], boundary: number | null): number | null =>
  (boundary === null ? null : log.find((entry) => entry.boundary === boundary)?.context.lastMessageId ?? null);

export const labelAuthorRows = (story: Pick<NormalizedStory, "life">, values: Read, log: readonly BoundaryLogEntry[]): LabelAuthorRow[] =>
  labelledRelationships(story).map(({ member, relationship }) => {
    const shownAt = shownLabelRow(member, relationship, values);
    return {
      member, toward: relationship.toward, shown: shownLabel(member, relationship, values),
      public: (relationship.public ?? []).map((row, at) => ({
        label: row.label, gate: row.when ? renderGateText(row.when) : null, holds: at === shownAt, follows: row.follows_feeling === true, hold: row.hold ?? null,
      })),
      secrets: (relationship.secret ?? []).map((secret) => {
        const boundary = revealedAt(member, relationship, secret, values);
        return { id: secret.id, label: secret.label, gate: renderGateText(secret.revealed_when), boundary, messageId: messageAt(log, boundary) };
      }),
    };
  });

export const unrevealedSecretLabels = (story: Pick<NormalizedStory, "life">, values: Read): string[] =>
  labelledRelationships(story).flatMap(({ member, relationship }) =>
    (relationship.secret ?? []).filter((secret) => revealedAt(member, relationship, secret, values) === null).map((secret) => secret.label));
