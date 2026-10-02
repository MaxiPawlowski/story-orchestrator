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

const targets = (entry: EpistemicEntry): string[] =>
  (entry.hiddenFrom ?? "").split(/,|\band\b/i).map(normalize).filter((name) => name !== "" && !EVERYONE.test(name));

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
    if (secret.tag === "hiding") knowers.add(normalize(secret.subject));
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

export function withheldEntryIds(entries: readonly MemoryEntry[], secrets: readonly HeldSecret[], member: readonly string[] | null): Set<string> {
  return new Set(secrets.length ? entries.filter((entry) => keptFrom(entry.text, secrets, member)).map((entry) => entry.id) : []);
}

export function ledgerWithoutSecrets(rows: LedgerView[], secrets: readonly HeldSecret[], member: readonly string[] | null): LedgerView[] {
  return secrets.length ? rows.filter((row) => !keptFrom(`${row.field} ${row.value}`, secrets, member)) : rows;
}
