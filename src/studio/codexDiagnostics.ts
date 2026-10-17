import { CODEX_PAGES, CODEX_START, evaluateGate, gateKeys, isReached, type CodexEntry, type CodexKnownWhen, type CodexPage, type StoryV2 } from "@engine/index";
import { entityNames, entryCondition } from "@engine/codex";

type CodexCode = "codex-fact-never-read" | "codex-gate-holds-at-start" | "disclosure-names-unknown-entity";

export const CODEX_CONSEQUENCES: Record<CodexCode, string> = {
  "codex-fact-never-read": "This line never reaches the player's page: it waits for a checkpoint no path reaches, or for a value nothing in the story writes.",
  "codex-gate-holds-at-start": "This line is known as soon as the story starts, one turn late: mark it \"start\" so it shows from the opening.",
  "disclosure-names-unknown-entity": "The page can name someone or somewhere before the player has learned of them, which spoils their discovery.",
};

export interface CodexRun {
  draft: StoryV2;
  reachableFrom: (start: string) => Set<string>;
  startId: string;
  push: (code: CodexCode, severity: "warning" | "info", path: string, message: string) => void;
}

const MECHANICAL = new Set(["message_count", "messages_in_checkpoint", "elapsed", "player_turns_in_checkpoint"]);

const writtenCodeKeys = (draft: StoryV2): Set<string> => {
  const keys = new Set<string>(MECHANICAL);
  (draft.quests ?? []).forEach((quest) => Object.keys(quest.reward?.set ?? {}).forEach((key) => keys.add(key)));
  const checks = [...draft.checkpoints.flatMap((checkpoint) => checkpoint.checks ?? []), ...draft.transitions.flatMap((transition) => (transition.check ? [transition.check] : []))];
  checks.forEach((check) => [check.quality, check.outcome?.quality, check.twist?.quality].forEach((key) => { if (key) keys.add(key); }));
  draft.qualities.filter((quality) => quality.roll).forEach((quality) => keys.add(quality.key));
  return keys;
};

interface Item {
  page: CodexPage;
  index: number;
  entry: CodexEntry;
}

const items = (draft: StoryV2): Item[] => CODEX_PAGES.flatMap((page) => (draft.codex?.[page] ?? []).map((entry, index) => ({ page, index, entry })));

const whens = ({ page, index, entry }: Item): Array<{ path: string; when: CodexKnownWhen; text?: string; what: string }> => {
  const condition = entryCondition(entry);
  return [
    ...(condition ? [{ path: `codex.${page}.${index}.known_when`, when: condition, what: `entry '${entry.id}'` }] : []),
    ...entry.facts.map((fact, at) => ({ path: `codex.${page}.${index}.facts.${at}`, when: fact.known_when, text: fact.text, what: `fact '${entry.id}.${fact.id}'` })),
    ...(entry.returns ?? []).map((back, at) => ({ path: `codex.${page}.${index}.returns.${at}`, when: back.when, text: back.text, what: `return '${entry.id}.${back.id}'` })),
  ];
};

const EMPTY = { get: () => undefined };

const checkReads = ({ draft, reachableFrom, startId, push }: CodexRun) => {
  const reachable = new Set([startId, ...reachableFrom(startId)]);
  const byKey = new Map(draft.qualities.map((quality) => [quality.key, quality]));
  const written = writtenCodeKeys(draft);
  items(draft).forEach((item) => whens(item).forEach(({ path, when, what }) => {
    if (when === CODEX_START) return;
    if (isReached(when)) {
      if (!reachable.has(when.reached)) push("codex-fact-never-read", "warning", path, `${what} waits for checkpoint '${when.reached}', which no path from the start reaches`);
      else if (when.reached === startId) push("codex-gate-holds-at-start", "info", path, `${what} waits for the start checkpoint; use "start"`);
      return;
    }
    const stuck = gateKeys(when).filter((key) => byKey.get(key)?.source === "code" && !written.has(key));
    if (stuck.length) push("codex-fact-never-read", "warning", path, `${what} waits for ${stuck.map((key) => `'${key}'`).join(", ")}, which nothing in the story writes`);
    else if (evaluateGate(when, EMPTY)) push("codex-gate-holds-at-start", "info", path, `${what} holds before anything happens; use "start"`);
  }));
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const mentions = (text: string, name: string): boolean => name.length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(name)}($|[^\\p{L}\\p{N}])`, "iu").test(text);

const sameWhen = (left: CodexKnownWhen | undefined, right: CodexKnownWhen | undefined) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const knownAlongside = (named: Item, when: CodexKnownWhen): boolean => {
  const condition = entryCondition(named.entry);
  if (condition === CODEX_START || named.entry.facts.some((fact) => fact.known_when === CODEX_START)) return true;
  return sameWhen(condition, when) || named.entry.facts.some((fact) => sameWhen(fact.known_when, when));
};

const checkDisclosure = ({ draft, push }: CodexRun) => {
  const all = items(draft);
  const named = all.map((item) => ({ item, names: entityNames({ codex: draft.codex, roster: draft.roster }, item.entry) }));
  all.forEach((item) => whens(item).forEach(({ path, when, text, what }) => {
    if (text === undefined || when === CODEX_START) return;
    named.filter((other) => other.item.entry.id !== item.entry.id && !knownAlongside(other.item, when)).forEach((other) => {
      const hit = other.names.find((name) => mentions(text, name));
      if (hit) push("disclosure-names-unknown-entity", "warning", `${path}.text`, `${what} names '${hit}', who may not be known when this ${what.split(" ")[0]} is; gate them together or reword`);
    });
  }));
};

export const checkCodexDraft = (run: CodexRun) => {
  if (!run.draft.codex?.people?.length && !run.draft.codex?.places?.length) return;
  checkReads(run);
  checkDisclosure(run);
};
