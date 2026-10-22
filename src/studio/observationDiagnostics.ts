import { CODEX_PAGES, CODEX_START, evaluateGate, gateKeys, isReached, type CodexKnownWhen, type Observation, type Story } from "@engine/index";
import { entityNames, entryCondition } from "@engine/codex";
import { speaksForPlayer } from "@wizard/cardChecks";
import { mentions, writtenCodeKeys } from "./codexDiagnostics";

type ObservationCode = "observation-imposes-mind" | "observation-instructs" | "observation-never-read" | "observation-gate-holds-at-start";

export const OBSERVATION_CONSEQUENCES: Record<ObservationCode, string> = {
  "observation-imposes-mind": "The line tells the player what they feel, think or conclude; that is theirs to decide, so the line reads as the story speaking for them.",
  "observation-instructs": "The line tells the player what to do; an observation shows what is there to see and leaves the next move to them.",
  "observation-never-read": "The player never notices this line: it waits for a checkpoint no path reaches, or for a value nothing in the story writes.",
  "observation-gate-holds-at-start": "The line is noticed on the first turn, before anything has happened; gate it on an event or make it a codex fact.",
};

export interface ObservationRun {
  draft: Story;
  reachableFrom: (start: string) => Set<string>;
  startId: string;
  push: (code: ObservationCode | "disclosure-names-unknown-entity", severity: "warning" | "info", path: string, message: string) => void;
}

const MIND = new RegExp("\\byou\\s+(?:feel|felt|think|thought|realise|realised|realize|realized|know|knew|sense|sensed|suspect|suspected|conclude|concluded|decide|decided"
  + "|believe|believed|wonder|wondered|fear|feared|hope|hoped|want|wanted|remember|remembered|understand|understood|recognise|recognize"
  + "|are\\s+(?:sure|certain|afraid|relieved|uneasy|convinced|glad))\\b", "i");
const YOUR_MIND = /\byour\s+(?:heart|gut|instinct|instincts|stomach|mind|fear|suspicion)\b/i;
const INSTRUCTS = /\byou\s+(?:should|must|need\s+to|ought\s+to|have\s+to|had\s+better|could\s+try)\b/i;
const IMPERATIVE = /(?:^|[.!?]\s+)(?:look|check|go|search|ask|follow|open|take|try|find|remember|don't|do\s+not|hurry|run|wait|listen|watch)\b/i;

export const imposesMind = (text: string): boolean => MIND.test(text) || YOUR_MIND.test(text) || speaksForPlayer(text);

export const instructs = (text: string): boolean => INSTRUCTS.test(text) || IMPERATIVE.test(text.trim());

const EMPTY = { get: () => undefined };

const sameWhen = (left: CodexKnownWhen | undefined, observation: Observation) => JSON.stringify(left ?? null) === JSON.stringify(observation.when);

const checkText = ({ draft, push }: ObservationRun, observation: Observation, path: string) => {
  const what = `observation '${observation.id}'`;
  if (imposesMind(observation.text)) push("observation-imposes-mind", "warning", `${path}.text`, `${what} says what the player feels, thinks or concludes; write only what is there to see`);
  if (instructs(observation.text)) push("observation-instructs", "warning", `${path}.text`, `${what} tells the player what to do; write only what is there to see`);
  CODEX_PAGES.flatMap((page) => draft.codex?.[page] ?? []).forEach((entry) => {
    const condition = entryCondition(entry);
    if (condition === CODEX_START || entry.facts.some((fact) => fact.known_when === CODEX_START) || sameWhen(condition, observation)
      || entry.facts.some((fact) => sameWhen(fact.known_when, observation))) return;
    const hit = entityNames({ codex: draft.codex, roster: draft.roster }, entry).find((name) => mentions(observation.text, name));
    if (hit) push("disclosure-names-unknown-entity", "warning", `${path}.text`, `observation '${observation.id}' names '${hit}', who may not be known when it is noticed; gate together or reword`);
  });
};

const checkWhen = ({ draft, reachableFrom, startId, push }: ObservationRun, observation: Observation, path: string, written: Set<string>) => {
  const { when } = observation;
  if (isReached(when)) {
    const reachable = new Set([startId, ...reachableFrom(startId)]);
    const what = `observation '${observation.id}'`;
    if (!reachable.has(when.reached)) push("observation-never-read", "warning", `${path}.when`, `${what} waits for checkpoint '${when.reached}', which no path from the start reaches`);
    else if (when.reached === startId) push("observation-gate-holds-at-start", "info", `${path}.when`, `${what} waits for the start checkpoint, so it shows on the first turn`);
    return;
  }
  const byKey = new Map(draft.qualities.map((quality) => [quality.key, quality]));
  const stuck = gateKeys(when).filter((key) => byKey.get(key)?.source === "code" && !written.has(key));
  const keys = stuck.map((key) => `'${key}'`).join(", ");
  if (stuck.length) push("observation-never-read", "warning", `${path}.when`, `observation '${observation.id}' waits for ${keys}, which nothing in the story writes`);
  else if (evaluateGate(when, EMPTY)) push("observation-gate-holds-at-start", "info", `${path}.when`, `observation '${observation.id}' holds before anything happens`);
};

export const checkObservationDraft = (run: ObservationRun) => {
  const list = run.draft.observations ?? [];
  if (!list.length) return;
  const written = writtenCodeKeys(run.draft);
  list.forEach((observation, index) => {
    const path = `observations.${index}`;
    checkText(run, observation, path);
    checkWhen(run, observation, path, written);
  });
};
