import { EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_KEY, MEMORY_INJECTION_KEY_PREFIX } from "../../src/constants/defaults";
import { provenance } from "../../src/memory/provenance";
import type { MemoryEntry, MemoryEntryType, MemoryExpiration, MemoryTier, ParsedArcSignal, ParsedEpistemicSignal, ParsedLedgerSignal } from "../../src/memory/types";
import { MemoryCoordinator } from "../../src/runtime/coordinators/memoryCoordinator";
import { createMemory } from "../../src/runtime/extras";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../../src/runtime/runToken";
import type { MemoryRuntimeSettings, MemoryRuntimeState } from "../../src/runtime/types";
import type { ModelCall } from "../../src/extraction/modelRoute";
import { termPresent } from "../../src/utils/termPresent";
import { fakeHosts } from "./fakeHosts";
import { probeArchiveRecall } from "./memoryProbesRecall";

export const PROBE_HORIZONS = [20, 60, 150] as const;
export const PROBE_KINDS = ["single", "update-fact", "update-ledger", "temporal", "kept-out", "secret-knower"] as const;
export type ProbeKind = typeof PROBE_KINDS[number];
export const PROBE_FLOORS = { availabilityAt60: 0.9, keptOutLeaks: 0 } as const;

const PLAYER = "Wren";
export const PROBE_CAST = [
  { id: "mira", name: "Mira" },
  { id: "tobin", name: "Tobin" },
  { id: "esk", name: "Esk" },
] as const;
const NAMES = PROBE_CAST.map((member) => member.name);

const PLACES = ["the mill", "the north bridge", "the market square", "the old chapel", "the ferry dock", "the stables", "the bakery", "the watchtower",
  "the orchard", "the tannery", "the granary", "the quarry road", "the lantern street", "the river ford", "the herb garden", "the smithy"];
const ITEMS = ["a brass compass", "a wool blanket", "a copper kettle", "a rope ladder", "a tin whistle", "a leather satchel", "a clay jug", "an iron hook",
  "a candle box", "a fishing net", "a pewter mug", "a spare saddle", "a sack of oats", "a bundle of reeds", "a walking staff", "a lamp chimney cap"];
const VERBS = ["mended", "carried", "traded", "cleaned", "inspected", "borrowed", "returned", "counted"];
const STATES = ["cracked", "freshly oiled", "missing a strap", "newly painted", "too heavy", "half full", "worn thin", "in good order"];
const MOODS = ["the rain will not stop", "the harvest looks thin", "the ferry runs late", "the tax collector is due", "the bell sounds off key", "the roads are muddy"];

interface ProbeSpec {
  id: string;
  kind: ProbeKind;
  plantAt: number;
  member: number;
  question: string;
  gold: string[];
  forbidden: string[];
}

export interface ProbePlant {
  facts?: Array<{ text: string; entities: string[]; type?: MemoryEntryType; tier?: "facts" | "session_details"; expiration?: MemoryExpiration; importance?: 1 | 2 | 3 }>;
  ledger?: ParsedLedgerSignal[];
  epistemic?: ParsedEpistemicSignal[];
  line?: string;
}

const SPOTS = [["cellar key", "floorboard"], ["silver locket", "chimney"], ["map case", "rain barrel"], ["wax seal", "hollow oak"]] as const;
const MOVES = [["ledger book", "pantry", "belfry"], ["signal horn", "loft", "boathouse"], ["spare lantern", "cupboard", "kiln"], ["gate token", "cellar", "dovecote"]] as const;
const LEDGER_MOVES = [["green banner", "armory", "infirmary"], ["toll chest", "counting room", "sexton lodge"], ["wagon wheel", "courtyard", "cooperage"], ["night bell", "gatehouse", "ropewalk"]] as const;
const EVENTS = [["comet", "flood"], ["wolf howl", "landslide"], ["eclipse", "wedding"], ["shipwreck", "fair"]] as const;
const SECRETS = [["forged", "toll receipts", "harbour"], ["poisoned", "cistern", "east ward"], ["bribed", "magistrate", "spring court"], ["stole", "relic", "abbey vault"]] as const;

export function probeSpecs(): { specs: ProbeSpec[]; plants: Map<number, ProbePlant[]> } {
  const specs: ProbeSpec[] = [];
  const plants = new Map<number, ProbePlant[]>();
  const plant = (at: number, value: ProbePlant) => plants.set(at, [...(plants.get(at) ?? []), value]);
  for (let index = 0; index < 4; index += 1) {
    const member = index % 3;
    const name = NAMES[member];
    const base = 2 + index;
    const [object, spot] = SPOTS[index];
    plant(base, { facts: [{ text: `${name} hid the ${object} behind the ${spot}.`, entities: [name, object] }], line: `${name} tucks the ${object} behind the ${spot}.` });
    specs.push({ id: `single-${index}`, kind: "single", plantAt: base, member, question: `${name}, where did you put the ${object}?`, gold: [spot], forbidden: [] });

    const [moved, from, to] = MOVES[index];
    plant(base, { facts: [{ text: `${name} keeps the ${moved} in the ${from}.`, entities: [name, moved] }] });
    plant(base + 3, { facts: [{ text: `${name} moved the ${moved} out of the ${from} and into the ${to}.`, entities: [name, moved] }] });
    specs.push({ id: `update-fact-${index}`, kind: "update-fact", plantAt: base + 3, member, question: `${name}, where is the ${moved} now?`, gold: [to], forbidden: [`in the ${from}`] });

    const [thing, first, second] = LEDGER_MOVES[index];
    plant(base, { ledger: [{ entity: thing, entityType: "item", field: "location", value: first }] });
    plant(base + 4, { ledger: [{ entity: thing, entityType: "item", field: "location", value: second }] });
    specs.push({ id: `update-ledger-${index}`, kind: "update-ledger", plantAt: base + 4, member, question: `${name}, where is the ${thing}?`, gold: [second], forbidden: [first] });

    const [early, late] = EVENTS[index];
    plant(base + 1, { facts: [{ text: `${name} watched the ${early} from the wall at dawn.`, entities: [name], type: "event" }] });
    plant(base + 3, { facts: [{ text: `After the ${early}, ${name} saw the ${late} reach the valley.`, entities: [name], type: "event" }] });
    specs.push({ id: `temporal-${index}`, kind: "temporal", plantAt: base + 3, member, question: `${name}, which came first, the ${early} or the ${late}?`, gold: [early, late], forbidden: [] });

    const knower = member;
    const kept = (member + 1) % 3;
    const [verb, object2, where] = SECRETS[index];
    const secret = `${NAMES[knower]} ${verb} the ${object2} at the ${where}`;
    plant(base + 2, {
      epistemic: [{ tag: "hiding", subject: NAMES[knower], content: secret, hiddenFrom: NAMES[kept] }],
      facts: [{ text: `${secret}.`, entities: [NAMES[knower]], type: "revelation", tier: "session_details", expiration: "permanent", importance: 3 },
        { text: `${secret}, quietly.`, entities: [NAMES[knower]], type: "fact", importance: 3 }],
    });
    specs.push({ id: `kept-out-${index}`, kind: "kept-out", plantAt: base + 2, member: kept, question: `${NAMES[kept]}, what happened with the ${object2}?`, gold: [], forbidden: [verb, object2] });
    specs.push({ id: `secret-knower-${index}`, kind: "secret-knower", plantAt: base + 2, member: knower, question: `${NAMES[knower]}, what happened with the ${object2}?`, gold: [object2], forbidden: [] });
  }
  return { specs, plants };
}

const pick = <T>(list: readonly T[], seed: number): T => list[((seed % list.length) + list.length) % list.length];

function filler(boundary: number): Required<Pick<ProbePlant, "facts" | "ledger" | "epistemic">> & { arcs: ParsedArcSignal[]; line: string } {
  const name = pick(NAMES, boundary);
  const place = pick(PLACES, boundary * 3 + 1);
  const item = pick(ITEMS, boundary * 5 + 2);
  const other = pick(ITEMS, boundary * 7 + 3);
  const arcs: ParsedArcSignal[] = boundary % 7 === 0 ? [{ kind: "open", text: `Find out who left ${pick(ITEMS, boundary)} at ${pick(PLACES, boundary)}` }] : [];
  if (boundary % 7 === 3 && boundary > 7) arcs.push({ kind: "resolved", text: `Find out who left ${pick(ITEMS, boundary - 10)} at ${pick(PLACES, boundary - 10)}` });
  return {
    line: `${name} ${pick(VERBS, boundary)} ${item} near ${place} while saying ${pick(MOODS, boundary)}.`,
    facts: [
      { text: `${name} said ${other} at ${pick(PLACES, boundary + 5)} is ${pick(STATES, boundary)}.`, entities: [name, other], importance: (1 + (boundary % 3)) as 1 | 2 | 3 },
      { text: `At ${place}, ${name} ${pick(VERBS, boundary + 1)} ${item}.`, entities: [name, item], type: "detail", tier: "session_details", expiration: boundary % 2 ? "scene" : "session", importance: 1 },
      { text: `${name} remarked that ${pick(MOODS, boundary + 2)}.`, entities: [name], type: "development", tier: "session_details", expiration: "session", importance: 2 },
    ],
    ledger: [{ entity: item.replace(/^an? /, ""), entityType: "item", field: "location", value: place.replace(/^the /, "") }],
    epistemic: boundary % 4 === 0 ? [{ tag: "knows", subject: name, content: `${pick(MOODS, boundary + 3)} this week` }] : [],
    arcs,
  };
}

export interface ProbeSessionOptions {
  boundaries?: number;
  settings?: Partial<MemoryRuntimeSettings>;
  model?: ModelCall;
  shortTermEvery?: number;
  sceneEvery?: number;
  consolidateEvery?: number;
  recall?: boolean;
  after?: (session: ProbeSession, boundary: number) => Promise<void> | void;
}

export interface ProbeResult {
  id: string;
  kind: ProbeKind;
  horizon: number;
  member: string;
  available: boolean;
  goldMissing: string[];
  forbiddenFound: string[];
  withRecall?: { available: boolean; recalled: boolean; goldMissing: string[]; forbiddenFound: string[] };
}

export interface ProbeSession {
  coordinator: MemoryCoordinator;
  memory: () => MemoryRuntimeState;
  setBoundary: (boundary: number) => void;
}

const refuseModel: ModelCall = async (_prompt, ask) => { throw new Error(`the probe session has no model (${ask.pass})`); };

export async function runProbeSession(options: ProbeSessionOptions = {}): Promise<{ results: ProbeResult[]; memory: MemoryRuntimeState }> {
  const boundaries = options.boundaries ?? 160;
  const prompts = new Map<string, string>();
  const chat: Array<{ name: string; mes: string; is_user: boolean; extra: Record<string, unknown> }> = [];
  let boundary = 0;
  const story = {
    title: "Probe Vale", id: "probe-vale", checkpointById: { cp1: { id: "cp1", name: "The vale", objective: "" } }, qualityByKey: {},
    roster: PROBE_CAST.map((member) => ({ ...member })), arc_bridges: [], requirements: { personas: [] },
  };
  const host = {
    settingsAreLoaded: () => true,
    settingsReady: async () => {},
    observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
    readServerBoundary: async () => null,
    getContext: () => ({ chat, chatId: "probe-chat", extensionSettings: {}, chatMetadata: {} }),
    getActiveGroup: () => ({ id: "g", members: PROBE_CAST.map((member) => `${member.id}.png`), disabled_members: [] }),
    resolveGroupMemberId: (name: string) => `${name.toLowerCase()}.png`,
    hostSystemUserName: "SillyTavern System",
    getCharacterNameById: (id: number) => NAMES[id],
    readInjectedPromptBlocks: () => [...prompts].map(([key, value]) => ({ key, value })),
    countTokens: async (text: string) => Math.ceil((text ?? "").trim().length / 4),
    capabilityState: async () => "absent",
    setStoryExtensionPrompt: (key: string, text: string) => { prompts.set(key, text); },
    clearStoryExtensionPrompt: (key: string) => { prompts.delete(key); },
  };
  const current: RunContext = { chatId: "probe-chat", storyId: "probe-vale", storyHash: "h", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  const base = createMemory();
  let memory: MemoryRuntimeState = { ...base, storyStart: 0, settings: { ...base.settings, ...options.settings } };
  const state = () => ({ activeCheckpointId: "cp1", boundary, lastMessageId: chat.length - 1, visitedPath: ["cp1"], blackboard: { values: {}, versions: {} } });
  const coordinator = new MemoryCoordinator({
    hosts: fakeHosts(host), getStory: () => story, getState: state, getMemory: () => memory, setMemory: (next: MemoryRuntimeState) => { memory = next; },
    model: options.model ?? refuseModel, getFiredTransitions: () => [], getExpansionGateSources: () => [], enqueueExtractorDeltas: () => {},
    enqueueMechanical: () => {}, ownership, judge: () => null, persist: async () => {}, notify: () => {},
  } as never);
  const session: ProbeSession = { coordinator, memory: () => memory, setBoundary: (value) => { boundary = value; } };
  const { specs, plants } = probeSpecs();
  const results: ProbeResult[] = [];
  const entry = (fact: NonNullable<ProbePlant["facts"]>[number], messageId: number): MemoryEntry => {
    const tier: MemoryTier = fact.tier ?? "facts";
    return {
      id: `m${messageId}-${fact.text.length}-${fact.text.slice(0, 12)}`, tier, text: fact.text, type: fact.type ?? "fact", importance: fact.importance ?? 2,
      expiration: fact.expiration ?? (tier === "facts" ? "permanent" : "session"), entities: fact.entities, confidence: 1, activationTriggers: [],
      evidence: fact.text, createdAt: boundary, messageId, recallCount: 0,
      provenance: provenance({ source: "extractor", messageId, boundary, pass: "shared-read" }),
    };
  };
  const every = { shortTerm: options.shortTermEvery ?? 6, scene: options.sceneEvery ?? 15, consolidate: options.consolidateEvery ?? 5 };
  for (boundary = 0; boundary < boundaries; boundary += 1) {
    const fill = filler(boundary);
    const planted = plants.get(boundary) ?? [];
    const speaker = NAMES[boundary % 3];
    chat.push({ name: PLAYER, mes: `${PLAYER} looks around. ${planted.map((value) => value.line ?? "").join(" ")}`.trim(), is_user: true, extra: {} });
    chat.push({ name: speaker, mes: `${fill.line} ${planted.flatMap((value) => value.facts ?? []).map((fact) => fact.text).join(" ")}`.trim(), is_user: false, extra: {} });
    const window = { from: chat.length - 2, to: chat.length - 1 };
    const facts = [...fill.facts, ...planted.flatMap((value) => value.facts ?? [])];
    const epistemic = [...fill.epistemic, ...planted.flatMap((value) => value.epistemic ?? [])];
    const ledger = [...fill.ledger, ...planted.flatMap((value) => value.ledger ?? [])];
    if (epistemic.length) coordinator.applyEpistemic(epistemic, window.to, [], window);
    await coordinator.applyEntries(facts.map((fact) => entry(fact, window.to)), window);
    if (fill.arcs.length) coordinator.applyArcSignals(fill.arcs, window.to);
    if (ledger.length) coordinator.applyLedger(ledger, window.to);
    if (boundary > 0 && boundary % every.shortTerm === 0) await shortTerm(coordinator, memory, chat, boundary);
    if (boundary > 0 && boundary % every.scene === 0) await sceneSummary(coordinator, memory, chat, boundary);
    if (boundary > 0 && boundary % every.consolidate === 0) await coordinator.runConsolidation().catch(() => undefined);
    await options.after?.(session, boundary);
    coordinator.updateInjection();
    for (const spec of specs) {
      const horizon = PROBE_HORIZONS.find((value) => spec.plantAt + value === boundary);
      if (horizon === undefined) continue;
      chat.push({ name: PLAYER, mes: spec.question, is_user: true, extra: {} });
      coordinator.updateInjection();
      coordinator.onMemberDrafted(spec.member);
      const prompt = [...prompts].filter(([key]) => key.startsWith(MEMORY_INJECTION_KEY_PREFIX) || key === LEDGER_INJECTION_KEY || key === EPISTEMIC_INJECTION_KEY)
        .map(([, value]) => value).join("\n");
      const recalled = options.recall ? probeArchiveRecall(memory, chat, boundary, (entries) => coordinator.injector.restingEntries(entries)) : "";
      coordinator.releasePrivateInjection();
      chat.pop();
      const goldMissing = spec.gold.filter((term) => !termPresent(prompt, term));
      const forbiddenFound = spec.forbidden.filter((term) => termPresent(prompt, term));
      const withRecall = options.recall ? check(spec, recalled ? `${prompt}\n${recalled}` : prompt) : null;
      results.push({
        id: spec.id, kind: spec.kind, horizon, member: NAMES[spec.member], available: !goldMissing.length && !forbiddenFound.length, goldMissing, forbiddenFound,
        ...(withRecall ? { withRecall: { ...withRecall, recalled: Boolean(recalled) } } : {}),
      });
    }
  }
  return { results, memory };
}

function check(spec: ProbeSpec, prompt: string) {
  const goldMissing = spec.gold.filter((term) => !termPresent(prompt, term));
  const forbiddenFound = spec.forbidden.filter((term) => termPresent(prompt, term));
  return { available: !goldMissing.length && !forbiddenFound.length, goldMissing, forbiddenFound };
}

async function shortTerm(coordinator: MemoryCoordinator, memory: MemoryRuntimeState, chat: Array<{ mes: string }>, boundary: number) {
  const from = memory.shortTermSummaryEnd + 1;
  const to = chat.length - 1;
  const recent = chat.slice(Math.max(from, to - 3), to + 1).map((row) => row.mes.split(". ")[0]).join(". ");
  const previous = coordinator.shortTermEntry()?.text ?? "";
  const text = `${previous.split(". ").slice(-2).join(". ")} ${recent}.`.trim();
  await coordinator.replaceShortTerm({
    id: `st${boundary}`, tier: "short_term", text, type: "scene", importance: 2, expiration: "session", entities: [], confidence: 1, activationTriggers: [],
    evidence: text, createdAt: boundary, messageId: to, recallCount: 0, provenance: provenance({ source: "extractor", messageId: to, boundary, pass: "short-term-compaction" }),
  }, { from, to });
}

async function sceneSummary(coordinator: MemoryCoordinator, memory: MemoryRuntimeState, chat: Array<{ mes: string }>, boundary: number) {
  const to = chat.length - 1;
  const from = coordinator.sceneStart(to);
  const text = chat.slice(from, to + 1).filter((_, index) => index % 6 === 1).slice(0, 3).map((row) => row.mes.split(". ")[0]).join(". ");
  await coordinator.addSceneSummary({
    id: `sc${boundary}`, tier: "scene_history", text, type: "scene", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [],
    evidence: text, createdAt: boundary, messageId: to, recallCount: 0, provenance: provenance({ source: "extractor", messageId: to, boundary, pass: "scene-summary" }),
  }, { from, to });
  void memory;
}

export interface ProbeSummaryRow { kind: ProbeKind; horizon: number; probes: number; available: number; share: number }

export interface RecallSummary { availabilityAt60: number; keptOutLeaks: number; hidden: string[]; gained: string[]; rows: ProbeSummaryRow[] }

export function summarizeRecall(results: readonly ProbeResult[]): RecallSummary | null {
  if (!results.some((result) => result.withRecall)) return null;
  const shifted = results.map((result) => ({ ...result, ...(result.withRecall ?? {}) }));
  const base = summarizeProbes(shifted);
  const label = (result: ProbeResult) => `${result.id}@${result.horizon}`;
  return {
    availabilityAt60: base.availabilityAt60, keptOutLeaks: base.keptOutLeaks, rows: base.rows,
    hidden: results.filter((result) => result.available && result.withRecall && !result.withRecall.available).map(label),
    gained: results.filter((result) => !result.available && result.withRecall?.available).map(label),
  };
}

export function summarizeProbes(results: readonly ProbeResult[]): { rows: ProbeSummaryRow[]; availabilityAt60: number; keptOutLeaks: number; total: number } {
  const rows = PROBE_KINDS.flatMap((kind) => PROBE_HORIZONS.map((horizon) => {
    const picked = results.filter((result) => result.kind === kind && result.horizon === horizon);
    const available = picked.filter((result) => result.available).length;
    return { kind, horizon, probes: picked.length, available, share: picked.length ? Number((available / picked.length).toFixed(3)) : 0 };
  }));
  const at60 = results.filter((result) => result.horizon === 60);
  return {
    rows,
    availabilityAt60: at60.length ? Number((at60.filter((result) => result.available).length / at60.length).toFixed(3)) : 0,
    keptOutLeaks: results.filter((result) => result.kind === "kept-out" && result.forbiddenFound.length).length,
    total: results.length,
  };
}
