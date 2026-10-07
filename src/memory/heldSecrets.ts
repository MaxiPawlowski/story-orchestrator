import { activeEpistemic } from "./epistemic";
import type { EpistemicEntry, LedgerView, MemoryEntry } from "./types";
import { contentWords, restatesWords, RESTATE_MIN_SHARED_WORDS } from "./words";

export interface HeldSecret {
  phrasings: Set<string>[];
  knowers: Set<string>;
  onlyFrom: Set<string> | null;
}

const EVERYONE = /^(?:everyone|everybody|all|the others|others)$/i;

const normalize = (name: string): string => name.trim().toLowerCase();

const stripNames = (text: string, names: ReadonlySet<string>): Set<string> => new Set([...contentWords(text)].filter((word) => !names.has(word)));

const people = (names: string): string[] => names.split(/,|\band\b/i).map(normalize).filter((name) => name !== "" && !EVERYONE.test(name));

const targets = (entry: EpistemicEntry): string[] => people(entry.hiddenFrom ?? "");

export function heldSecrets(epistemic: readonly EpistemicEntry[], names: readonly string[]): HeldSecret[] {
  const active = activeEpistemic([...epistemic]);
  const named = new Set([...names, ...active.map((entry) => entry.subject)].flatMap((name) => [...contentWords(name)]));
  return active.filter((entry) => entry.tag === "hiding" || entry.tag === "unaware").flatMap((secret) => {
    const words = stripNames(secret.content, named);
    if (words.size < RESTATE_MIN_SHARED_WORDS) return [];
    const barred = new Set(secret.tag === "hiding" ? targets(secret) : [normalize(secret.subject)]);
    const echoes = active.filter((entry) => entry !== secret && entry.tag !== "unaware" && !barred.has(normalize(entry.subject))
      && restatesWords(words, stripNames(entry.content, named)));
    const knowers = new Set(echoes.map((entry) => normalize(entry.subject)));
    if (secret.tag === "hiding") [normalize(secret.subject), ...people(secret.subject)].forEach((name) => knowers.add(name));
    const phrasings = [words, ...echoes.map((entry) => stripNames(entry.content, named)).filter((echo) => echo.size >= RESTATE_MIN_SHARED_WORDS)];
    return [{ phrasings, knowers, onlyFrom: secret.tag === "unaware" ? barred : null }];
  });
}

const allowed = (secret: HeldSecret, names: readonly string[]): boolean =>
  (secret.onlyFrom
    ? names.length > 0 && !names.some((name) => secret.onlyFrom?.has(name))
    : names.some((name) => secret.knowers.has(name)));

export const keptFrom = (text: string, secrets: readonly HeldSecret[], member: readonly string[] | null): boolean => {
  const names = member?.map(normalize) ?? [];
  const words = contentWords(text);
  return secrets.some((secret) => !allowed(secret, names) && secret.phrasings.some((phrasing) => restatesWords(phrasing, words)));
};

const SENTENCE_BREAK = /(?<=[.!?]["')\]]?)\s+|\n+/;

const redacted = (text: string, secrets: readonly HeldSecret[], member: readonly string[] | null): string | null => {
  const sentences = text.split(SENTENCE_BREAK).map((sentence) => sentence.trim()).filter(Boolean);
  const shown = sentences.filter((sentence) => !keptFrom(sentence, secrets, member));
  const joined = shown.join(" ");
  return shown.length && shown.length < sentences.length && !keptFrom(joined, secrets, member) ? joined : null;
};

export const withoutSecrets = (text: string, secrets: readonly HeldSecret[], member: readonly string[] | null): string =>
  (secrets.length && keptFrom(text, secrets, member) ? redacted(text, secrets, member) ?? "" : text);

export const withoutSecretLines = (text: string, secrets: readonly HeldSecret[], member: readonly string[] | null): string => {
  if (!secrets.length) return text;
  return text.split("\n").flatMap((line) => {
    if (!line.trim()) return [line];
    const shown = withoutSecrets(line, secrets, member);
    return shown ? [shown] : [];
  }).join("\n");
};

export interface SharedTierView {
  entries: MemoryEntry[];
  withheld: Set<string>;
}

export function sharedTierView(entries: MemoryEntry[], secrets: readonly HeldSecret[], member: readonly string[] | null): SharedTierView {
  const withheld = new Set<string>();
  if (!secrets.length) return { entries, withheld };
  const shown = entries.map((entry) => {
    if (!keptFrom(entry.text, secrets, member)) return entry;
    const text = redacted(entry.text, secrets, member);
    if (text === null) withheld.add(entry.id);
    return text === null ? entry : { ...entry, text };
  });
  return { entries: shown, withheld };
}

export function withheldEntryIds(entries: readonly MemoryEntry[], secrets: readonly HeldSecret[], member: readonly string[] | null): Set<string> {
  return new Set(secrets.length ? entries.filter((entry) => keptFrom(entry.text, secrets, member)).map((entry) => entry.id) : []);
}

export function ledgerWithoutSecrets(rows: LedgerView[], secrets: readonly HeldSecret[], member: readonly string[] | null): LedgerView[] {
  return secrets.length ? rows.filter((row) => !keptFrom(`${row.field} ${row.value}`, secrets, member)) : rows;
}
