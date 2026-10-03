import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { MUTATION_VERBS } from './sessionLive.mts';

export const COLUMNS = ['on', 'defaults'] as const;
export type Column = (typeof COLUMNS)[number];
export const COMMAND_VERBS = ['seed', 'start', 'settings', 'open', 'header-capture', 'play', 'header-diff', 'verify'] as const;
export type CommandVerb = (typeof COMMAND_VERBS)[number];
export const SERVICES = ['memory', 'judge', 'gpu'] as const;
export type Service = (typeof SERVICES)[number];
export const OUTAGE_SERVICES_REQUIRED: Record<Service, number> = { memory: 2, judge: 1, gpu: 1 };
export const RUN_IDS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6'] as const;
export const ROUTED_RUNS = ['I1', 'I2', 'I3'] as const;
export const REOPEN_FIELDS = ['engine.activeCheckpointId', 'engine.boundary', 'engine.blackboard', 'engine.visitedPath', 'wi.gating', 'wi.scanGate', 'sampler', 'sprites', 'timeline'] as const;
export const VOLATILE_KEYS = new Set(['at', 'capturedAt', 'updatedAt', 'createdAtMs', 'ts', 'latencyMs', 'lastPollAt', 'checkedAt']);
export const HEADER_DIFF_ALLOW = 'chatId,chat,story,group,inventory.journal';

export interface RouteStep { set?: Record<string, unknown>; activate?: string; expect: string }
export interface RouteDoc { story: string; name: string; steps: RouteStep[] }
export interface RouteRef { file: string; name: string; from: number; to: number; throughExpect?: string; acts?: string }
export interface Drive { mode: 'play-then-set' | 'turns'; turnsPerStep: number; maxForcedShare: number; turns?: number }
export interface Mutation { afterTurn: number; verb: string }
export interface Outage { service: string; fromTurn: number; toTurn: number; exercisable: boolean; why?: string }
export interface Read { id: string; from: string; what: string }
export interface ArtifactSpec { file: string; kind: 'json' | 'jsonl' | 'text'; perChat?: boolean; minRows?: number | 'cuts' | 'outages'; what?: string }
export interface Resolution { id: string; what: string; source: string; target: string; status: 'pending' | 'resolved'; value: Record<string, unknown> | null; fallback: Record<string, unknown>; fallbackMeans?: string }
export interface ColumnSpec { description: string; wiGating: 'scan' | 'file'; authorView: boolean; patch: Record<string, unknown>; resolutions: Resolution[]; readback: Record<string, unknown> }
export interface RunSpec {
  id: string; title: string; tier: string; story: string | null; group: string | null; chats: number; columns: string[]; commands: string[];
  route?: RouteRef; drive?: Drive; cuts?: number[]; mutations?: Mutation[]; outages?: Outage[]; ridesOn?: string[]; cutsPerRun?: number;
  reads: Read[]; artifacts: string[];
}
export interface RunsDoc {
  version: number; tier: string;
  campaign: { repo: string; pinFile: string; commit: string; routes: Record<string, string> };
  storyIndex: string; outRoot: string;
  drive: { turnsPerStep: number; lineTemplates: string[]; freeLines: string[]; editText: string; timeoutMs: number; quietMs: number; tailReadyMs: number; tailDrainMs: number };
  baseline: { preserve: string[] };
  media: { patch: Record<string, unknown>; reason: string; unexercised: string[] };
  columns: Record<Column, ColumnSpec>;
  services: Record<Service, { urlIncludes: string; bodyUrlOf?: string }>;
  artifacts: Record<string, ArtifactSpec>;
  commonArtifacts: string[];
  commands: string[];
  reopenFields: string[];
  runs: RunSpec[];
}
export interface StoryIndexLike { commit: string; stories: Record<string, { group: string | null; checkpoints: Array<{ id: string }> }> }

const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export const BULKY_EVIDENCE_BYTES = 1_000_000;

export function splitBulkyEvidence(evidence: unknown, chatId: string, limit = BULKY_EVIDENCE_BYTES): { committed: string; full: { file: string; text: string } | null } {
  const text = JSON.stringify(evidence, null, 1);
  if (Buffer.byteLength(text, 'utf-8') <= limit || !isRecord(evidence) || !isRecord(evidence.slices)) return { committed: text, full: null };
  const file = `evidence-${chatId}.full.json`;
  const chat = evidence.slices.chat;
  const summary = { omitted: true, file, bytes: Buffer.byteLength(text, 'utf-8'), sha256: sha256(text), messages: Array.isArray(chat) ? chat.length : null };
  return { committed: JSON.stringify({ ...evidence, slices: { ...evidence.slices, chat: summary } }, null, 1), full: { file, text } };
}

export const runById = (doc: RunsDoc, id: string): RunSpec | null => doc.runs.find((run) => run.id.toUpperCase() === String(id).toUpperCase()) ?? null;

export function routeSlice(routes: Record<string, RouteDoc[]>, ref: RouteRef): { route: RouteDoc | null; steps: RouteStep[]; problems: string[] } {
  const docs = routes[ref.file];
  if (!Array.isArray(docs)) return { route: null, steps: [], problems: [`route file ${ref.file} was not read from the pin`] };
  const route = docs.find((candidate) => isRecord(candidate) && candidate.name === ref.name) ?? null;
  if (!route) return { route: null, steps: [], problems: [`route "${ref.name}" is not in ${ref.file}`] };
  const problems: string[] = [];
  if (!Number.isInteger(ref.from) || !Number.isInteger(ref.to) || ref.from < 0 || ref.to > route.steps.length || ref.from >= ref.to) {
    problems.push(`route "${ref.name}" slice [${ref.from}, ${ref.to}) is outside its ${route.steps.length} steps`);
    return { route, steps: [], problems };
  }
  const steps = route.steps.slice(ref.from, ref.to);
  if (ref.throughExpect && steps[steps.length - 1]?.expect !== ref.throughExpect) problems.push(`route "${ref.name}" slice ends at ${steps[steps.length - 1]?.expect}, not the declared ${ref.throughExpect}`);
  return { route, steps, problems };
}

export function validateRuns(doc: RunsDoc, index: StoryIndexLike, routes: Record<string, RouteDoc[]>): string[] {
  const problems: string[] = [];
  if (!isRecord(doc)) return ['the runs file is not an object'];
  if (doc.tier !== 'T7') problems.push(`the runs file tier is ${doc.tier}, not T7`);
  if (!doc.campaign?.commit || !/^[0-9a-f]{40}$/.test(doc.campaign.commit)) problems.push('campaign.commit must be a full sha');
  if (index?.commit && doc.campaign?.commit && index.commit !== doc.campaign.commit) problems.push(`the story index was built from ${index.commit}, the runs pin ${doc.campaign.commit}`);
  for (const column of COLUMNS) {
    const spec = doc.columns?.[column];
    if (!spec) { problems.push(`column ${column} is not declared`); continue; }
    if (!isRecord(spec.patch)) problems.push(`column ${column} has no patch object`);
    if (!isRecord(spec.readback) || Object.keys(spec.readback).length === 0) problems.push(`column ${column} declares no read-back`);
    if (spec.wiGating !== 'scan' && spec.wiGating !== 'file') problems.push(`column ${column} wiGating must be scan or file`);
    if (column === 'defaults' && isRecord(spec.patch) && Object.keys(spec.patch).length > 0) problems.push('column defaults must have an empty patch');
    for (const resolution of spec.resolutions ?? []) {
      if (!resolution.source || !resolution.target) problems.push(`column ${column} resolution ${resolution.id} needs a source and a target`);
      if (resolution.status === 'resolved' && !isRecord(resolution.value)) problems.push(`column ${column} resolution ${resolution.id} is resolved with no value`);
    }
  }
  for (const key of ['image', 'sprites']) {
    if ((doc.media?.patch?.[key] as Record<string, unknown> | undefined)?.enabled !== false) problems.push(`media.patch.${key}.enabled must be false (ComfyUI is not to be contacted)`);
  }
  if (!doc.media?.reason) problems.push('media needs the recorded reason images/sprites stay off');
  for (const id of RUN_IDS) if (!runById(doc, id)) problems.push(`run ${id} is not declared`);
  for (const run of doc.runs ?? []) {
    const at = `run ${run.id}`;
    if (run.tier !== 'T7') problems.push(`${at} tier is ${run.tier}, not T7`);
    for (const column of COLUMNS) if (!run.columns?.includes(column)) problems.push(`${at} does not run column ${column}`);
    if (!Array.isArray(run.commands) || run.commands.length === 0) problems.push(`${at} has no command plan`);
    else {
      const unknown = run.commands.filter((verb) => !(COMMAND_VERBS as readonly string[]).includes(verb));
      if (unknown.length) problems.push(`${at} command plan names unknown verbs ${unknown.join(', ')}`);
      if (run.commands[run.commands.length - 1] !== 'verify') problems.push(`${at} command plan does not end with verify`);
      if (!run.ridesOn) for (const verb of COMMAND_VERBS) if (!run.commands.includes(verb)) problems.push(`${at} command plan is missing ${verb}`);
    }
    if (!Array.isArray(run.artifacts) || run.artifacts.length === 0) problems.push(`${at} declares no required artifacts`);
    for (const artifact of run.artifacts ?? []) if (!doc.artifacts?.[artifact]) problems.push(`${at} requires unknown artifact ${artifact}`);
    if (!run.ridesOn) for (const artifact of doc.commonArtifacts ?? []) if (!run.artifacts?.includes(artifact)) problems.push(`${at} is missing required artifact ${artifact}`);
    if (!Array.isArray(run.reads) || run.reads.length === 0) problems.push(`${at} declares no reads`);
    for (const read of run.reads ?? []) if (!run.artifacts?.includes(read.from)) problems.push(`${at} read ${read.id} comes from ${read.from}, which the run does not require`);
    if (run.ridesOn) {
      for (const host of ROUTED_RUNS) if (!run.ridesOn.includes(host)) problems.push(`${at} must ride on ${host}`);
      if (run.cutsPerRun !== 3) problems.push(`${at} must cut each host run 3 times`);
      for (const host of run.ridesOn) {
        const hostRun = runById(doc, host);
        if (!hostRun) continue;
        if ((hostRun.cuts ?? []).length !== 3) problems.push(`${at}: ${host} declares ${(hostRun.cuts ?? []).length} cut points, not 3`);
        if (!hostRun.artifacts?.includes('reopen')) problems.push(`${at}: ${host} does not require the reopen artifact`);
      }
      continue;
    }
    const story = run.story ? index?.stories?.[run.story] : null;
    if (!story) { problems.push(`${at} story ${run.story} is not in the story index`); continue; }
    if (story.group !== run.group) problems.push(`${at} group "${run.group}" is not the story's group "${story.group}"`);
    if (!run.route) { problems.push(`${at} has no route`); continue; }
    if (!doc.campaign?.routes?.[run.route.file]) problems.push(`${at} route file ${run.route.file} has no frozen sha256`);
    const slice = routeSlice(routes, run.route);
    problems.push(...slice.problems.map((problem) => `${at}: ${problem}`));
    if (slice.route && slice.route.story !== run.story) problems.push(`${at} route "${run.route.name}" belongs to ${slice.route.story}, not ${run.story}`);
    const known = new Set(story.checkpoints.map((checkpoint) => checkpoint.id));
    slice.steps.forEach((step, offset) => {
      if (!known.has(step.expect)) problems.push(`${at} route step ${run.route!.from + offset} expects ${step.expect}, which ${run.story} does not have`);
      if (step.activate && !known.has(step.activate)) problems.push(`${at} route step ${run.route!.from + offset} activates ${step.activate}, which ${run.story} does not have`);
    });
    if (!run.drive || !['play-then-set', 'turns'].includes(run.drive.mode)) problems.push(`${at} drive mode must be play-then-set or turns`);
    else {
      if (!(run.drive.turnsPerStep >= 1)) problems.push(`${at} drive needs turnsPerStep >= 1`);
      if (!(run.drive.maxForcedShare >= 0 && run.drive.maxForcedShare <= 1)) problems.push(`${at} drive needs maxForcedShare in [0, 1]`);
      if (run.drive.mode === 'turns' && !(Number(run.drive.turns) >= 1)) problems.push(`${at} drive mode turns needs a turn count`);
    }
    if (run.id === 'I4' || run.mutations) {
      const verbs = new Set((run.mutations ?? []).map((mutation) => mutation.verb));
      for (const verb of MUTATION_VERBS) if (!verbs.has(verb)) problems.push(`${at} mutation schedule never uses ${verb}`);
      for (const mutation of run.mutations ?? []) {
        if (!(MUTATION_VERBS as readonly string[]).includes(mutation.verb)) problems.push(`${at} mutation ${mutation.verb} is not a session verb`);
        if (!(mutation.afterTurn >= 1 && mutation.afterTurn <= Number(run.drive?.turns ?? 0))) problems.push(`${at} mutation after turn ${mutation.afterTurn} is outside the run`);
      }
      if ((run.mutations ?? []).some((mutation) => mutation.verb === 'switch-chat-mid-gen') && run.chats < 2) problems.push(`${at} switches chat but opens only ${run.chats} chat`);
    }
    if (run.id === 'I5' || run.outages) {
      const counts: Record<string, number> = {};
      for (const outage of run.outages ?? []) {
        counts[outage.service] = (counts[outage.service] ?? 0) + 1;
        if (!(SERVICES as readonly string[]).includes(outage.service)) problems.push(`${at} cuts unknown service ${outage.service}`);
        if (!(outage.fromTurn >= 1 && outage.toTurn >= outage.fromTurn && outage.toTurn <= Number(run.drive?.turns ?? 0))) problems.push(`${at} ${outage.service} cut [${outage.fromTurn}, ${outage.toTurn}] is outside the run`);
        if (outage.exercisable === false && !outage.why) problems.push(`${at} ${outage.service} cut is declared unexercisable with no reason`);
      }
      for (const [service, wanted] of Object.entries(OUTAGE_SERVICES_REQUIRED)) if ((counts[service] ?? 0) < wanted) problems.push(`${at} cuts ${service} ${counts[service] ?? 0} time(s), needs ${wanted}`);
      if (!run.artifacts?.includes('outages')) problems.push(`${at} cuts services but does not require the outages artifact`);
    }
    for (const cut of run.cuts ?? []) if (!(Number.isInteger(cut) && cut >= 0 && cut < slice.steps.length)) problems.push(`${at} cut point after step ${cut} is outside its ${slice.steps.length} route steps`);
  }
  return problems;
}

export function freezeCheck(doc: RunsDoc, blobs: Record<string, string | Buffer | null>): string[] {
  const problems: string[] = [];
  for (const [file, expected] of Object.entries(doc.campaign?.routes ?? {})) {
    const blob = blobs[file];
    if (blob === undefined || blob === null) { problems.push(`${file} could not be read at ${doc.campaign.commit}`); continue; }
    const actual = sha256(blob);
    if (actual !== expected) problems.push(`${file} at ${doc.campaign.commit} hashes ${actual}, the runs file froze ${expected}: refusing to run on changed inputs`);
  }
  return problems;
}

export function parseRouteBlobs(blobs: Record<string, string | Buffer | null>): Record<string, RouteDoc[]> {
  const out: Record<string, RouteDoc[]> = {};
  for (const [file, blob] of Object.entries(blobs)) {
    if (blob === null || blob === undefined) continue;
    const parsed = JSON.parse(String(blob));
    out[file] = (Array.isArray(parsed) ? parsed : []).filter((route: any) => isRecord(route) && typeof route.name === 'string' && Array.isArray(route.steps));
  }
  return out;
}

export const hostDirName = (host: string, column: Column, attempt = 1) => `${host}-${column}-r${attempt}`;

export const outDirFor = (doc: RunsDoc, runId: string, column: Column, attempt = 1) => `${doc.outRoot}/${hostDirName(runId, column, attempt)}`;

const q = (value: string) => (/[\s"']/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value);

export function renderPlan(doc: RunsDoc, runId: string, column: Column, lane: number, { out = null as string | null, acceptFallback = false } = {}): string[] {
  const run = runById(doc, runId);
  if (!run) throw new Error(`no run ${runId}`);
  if (!(COLUMNS as readonly string[]).includes(column)) throw new Error(`column must be on or defaults, not ${column}`);
  if (!Number.isInteger(lane) || lane < 1) throw new Error('lanes 1+ only; lane 0 is the user\'s');
  const inLane = (args: string) => `node scripts/debug/st-lanes.mts run ${lane} -- ${args}`;
  if (run.ridesOn) {
    const root = out ?? doc.outRoot;
    return [
      `# ${run.id} rides on ${run.ridesOn.join(', ')}: their plays take the ${run.cutsPerRun} reopen cuts each; run their plans first`,
      ...run.ridesOn.map((host) => `node scripts/debug/so-integration.mts verify ${q(`${root}/${hostDirName(host, column)}`)} ${host} --column ${column}`),
      `node scripts/debug/so-integration.mts verify ${q(root)} ${run.id} --column ${column}`,
    ];
  }
  const dir = out ?? outDirFor(doc, run.id, column);
  const fallback = acceptFallback ? ' --accept-fallback' : '';
  const lines: Record<CommandVerb, string> = {
    seed: `node scripts/debug/adolion-fresh.mts seed ${lane} --headed`,
    start: `node scripts/debug/st-lanes.mts start ${lane} --headed`,
    settings: inLane(`scripts/debug/so-integration.mts settings ${run.id} --column ${column} --out ${q(dir)}${fallback}`),
    open: inLane(`scripts/debug/so-integration.mts open ${run.id} --column ${column} --out ${q(dir)}`),
    'header-capture': inLane(`scripts/debug/so-run-header.mts capture --label v26-09-${run.id}-${column} --out ${q(`${dir}/run-header-start.json`)}`),
    play: inLane(`scripts/debug/so-integration.mts play ${run.id} --column ${column} --out ${q(dir)}`),
    'header-diff': `${inLane(`scripts/debug/so-run-header.mts diff ${q(`${dir}/run-header-start.json`)} --allow ${HEADER_DIFF_ALLOW} --out ${q(`${dir}/run-header-end.json`)}`)} > ${q(`${dir}/run-header-diff.txt`)}`,
    verify: `node scripts/debug/so-integration.mts verify ${q(dir)} ${run.id} --column ${column}`,
  };
  return run.commands.map((verb) => lines[verb as CommandVerb]);
}

const pathGet = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((at, key) => (isRecord(at) ? at[key] : undefined), value);

const pathSet = (target: Record<string, any>, path: string, value: unknown) => {
  const keys = path.split('.');
  let at = target;
  for (const key of keys.slice(0, -1)) at = (at[key] = isRecord(at[key]) ? at[key] : {});
  at[keys[keys.length - 1]] = value;
};

export const deepMerge = (base: Record<string, any>, patch: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = isRecord(value) && isRecord(base[key]) ? deepMerge(base[key], value) : value;
  return out;
};

export function baselineOf(current: unknown, preserve: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const path of preserve) {
    const value = pathGet(current, path);
    if (value !== undefined) pathSet(out, path, JSON.parse(JSON.stringify(value)));
  }
  return out;
}

export function columnSettings(doc: RunsDoc, column: Column, { acceptFallback = false } = {}) {
  const spec = doc.columns[column];
  const pending = (spec.resolutions ?? []).filter((resolution) => resolution.status !== 'resolved');
  if (pending.length && !acceptFallback) {
    return {
      refusal: `column ${column} has unresolved settings: ${pending.map((resolution) => `${resolution.id} (${resolution.source})`).join('; ')}. Transcribe each decision into runs.json (status resolved + value), or pass --accept-fallback to run on the recorded fallback.`,
      patch: null, fallbacksUsed: [] as string[],
    };
  }
  let patch = deepMerge({}, spec.patch ?? {});
  for (const resolution of spec.resolutions ?? []) patch = deepMerge(patch, resolution.status === 'resolved' && resolution.value ? resolution.value : resolution.fallback ?? {});
  patch = deepMerge(patch, doc.media.patch);
  return { refusal: null as string | null, patch, fallbacksUsed: pending.map((resolution) => resolution.id) };
}

export function readbackProblems(effective: unknown, raw: unknown, expect: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [path, wanted] of Object.entries(expect)) {
    const got = pathGet(effective, path);
    const normalized = got === undefined ? null : got;
    if (JSON.stringify(normalized) !== JSON.stringify(wanted)) problems.push(`${path}: effective ${JSON.stringify(normalized)}, expected ${JSON.stringify(wanted)}`);
  }
  if (!isRecord(raw)) problems.push('the raw settings root could not be read back');
  return problems;
}

export function lineFor(doc: RunsDoc, { checkpointName, turn, free }: { checkpointName: string | null; turn: number; free: boolean }): string {
  const pool = free || !checkpointName ? doc.drive.freeLines : doc.drive.lineTemplates;
  return pool[(Math.max(1, turn) - 1) % pool.length].replace(/\{checkpoint\}/g, checkpointName ?? 'what comes next');
}

export function stepReached(read: { activeCheckpointId: string | null; blackboard: Record<string, unknown> }, step: RouteStep, previousExpect: string | null): boolean {
  if (read.activeCheckpointId !== step.expect) return false;
  if (previousExpect !== step.expect) return true;
  return Object.entries(step.set ?? {}).every(([key, value]) => String(read.blackboard?.[key]) === String(value));
}

export function mutationAfter(run: RunSpec, turn: number): Mutation | null {
  return (run.mutations ?? []).find((mutation) => mutation.afterTurn === turn) ?? null;
}

export function activeOutages(run: RunSpec, turn: number): Outage[] {
  return (run.outages ?? []).filter((outage) => turn >= outage.fromTurn && turn <= outage.toTurn);
}

const normalizeUrl = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().toLowerCase().replace(/\/+$/, '') : null);
const BODY_URL_FIELDS = ['api_server', 'custom_url', 'server_url', 'reverse_proxy', 'api_url'];

export function bodyServerUrls(postData: string | null | undefined): string[] {
  if (!postData) return [];
  let body: unknown;
  try { body = JSON.parse(postData); } catch { return []; }
  if (!isRecord(body)) return [];
  return BODY_URL_FIELDS.map((field) => normalizeUrl(body[field])).filter((url): url is string => Boolean(url));
}

export interface ProfileSignature { name?: string; mode: 'cc' | 'tc' | null; source: string | null; model: string | null; url: string | null }
export interface OutageContext { memory: ProfileSignature[]; main: ProfileSignature | null }
export interface OutageRequest { url: string; method?: string; postData?: string | null }

const lower = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null);

export function profileSignature(profile: Record<string, unknown> | null | undefined): ProfileSignature | null {
  if (!isRecord(profile)) return null;
  const mode = profile.mode === 'cc' || profile.mode === 'tc' ? profile.mode : null;
  return {
    ...(typeof profile.name === 'string' ? { name: profile.name } : {}),
    mode,
    source: mode === 'cc' ? lower(profile.api) : null,
    model: lower(profile.model),
    url: normalizeUrl(profile['api-url']),
  };
}

export function requestSignature(postData: string | null | undefined): { source: string | null; model: string | null; urls: string[] } {
  let body: unknown = null;
  try { body = postData ? JSON.parse(postData) : null; } catch { body = null; }
  if (!isRecord(body)) return { source: null, model: null, urls: [] };
  return { source: lower(body.chat_completion_source), model: lower(body.model), urls: bodyServerUrls(postData) };
}

const identifies = (signature: ProfileSignature) => Boolean(signature.source || signature.url);

export function requestMatchesProfile(postData: string | null | undefined, signature: ProfileSignature): boolean {
  if (!identifies(signature)) return false;
  const request = requestSignature(postData);
  if (signature.source) {
    if (request.source !== signature.source) return false;
    if (signature.model && request.model && request.model !== signature.model) return false;
    return !signature.url || !request.urls.length || request.urls.includes(signature.url);
  }
  return request.source === null && Boolean(signature.url) && request.urls.includes(signature.url as string);
}

const sameOrUnknown = (a: string | null, b: string | null) => !a || !b || a === b;

export function indistinguishable(a: ProfileSignature, b: ProfileSignature): boolean {
  if ((a.source ?? null) !== (b.source ?? null)) return false;
  if (a.source) return sameOrUnknown(a.model, b.model) && sameOrUnknown(a.url, b.url);
  return Boolean(a.url) && a.url === b.url;
}

export function outagePreflight(run: RunSpec, context: OutageContext): string[] {
  if (!(run.outages ?? []).some((outage) => outage.service === 'memory')) return [];
  const memory = context.memory.filter(identifies);
  if (!memory.length) return ['no orchestrator profile carries a source or an api-url to match, so the memory-model cut cannot be scoped'];
  if (!context.main) return ['the main reply profile could not be read, so a memory-model cut cannot be proven to spare it'];
  const shared = memory.filter((signature) => indistinguishable(signature, context.main as ProfileSignature));
  return shared.length
    ? [`the memory model (${shared.map((s) => s.name ?? s.source ?? s.url).join(', ')}) and the main reply (${context.main.name ?? context.main.source ?? context.main.url}) share one endpoint and source: a cut would also abort the main reply, so ${run.id} cannot cut the memory model alone on this lane`]
    : [];
}

export function outageMatcher(doc: RunsDoc, active: () => Outage[], context: OutageContext) {
  const memory = context.memory.filter(identifies);
  const main = context.main;
  return (request: OutageRequest): { abort: boolean; service: Service | null } => {
    for (const outage of active()) {
      const service = outage.service as Service;
      const rule = doc.services[service];
      if (!rule || !request.url.includes(rule.urlIncludes)) continue;
      if (rule.bodyUrlOf === 'memoryProfile') {
        if (main && requestMatchesProfile(request.postData, main)) continue;
        if (memory.some((signature) => requestMatchesProfile(request.postData, signature))) return { abort: true, service };
        continue;
      }
      return { abort: true, service };
    }
    return { abort: false, service: null };
  };
}

const stripVolatile = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !VOLATILE_KEYS.has(key)).map(([key, inner]) => [key, stripVolatile(inner)]));
};

export interface ReopenDiff { field: string; path: string; from: unknown; to: unknown }

function diffValues(field: string, path: string, from: unknown, to: unknown, out: ReopenDiff[]) {
  if (isRecord(from) && isRecord(to)) {
    for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) diffValues(field, `${path}.${key}`, from[key], to[key], out);
    return;
  }
  if (Array.isArray(from) && Array.isArray(to) && from.length === to.length) {
    from.forEach((item, at) => diffValues(field, `${path}[${at}]`, item, to[at], out));
    return;
  }
  if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) out.push({ field, path, from: from ?? null, to: to ?? null });
}

export function diffReopen(continuous: unknown, reopened: unknown, fields: readonly string[] = REOPEN_FIELDS): ReopenDiff[] {
  const out: ReopenDiff[] = [];
  for (const field of fields) diffValues(field, field, stripVolatile(pathGet(continuous, field)), stripVolatile(pathGet(reopened, field)), out);
  return out;
}

export function engineHistoryFrom(blob: unknown) {
  if (!isRecord(blob)) return null;
  const record = blob.stories?.[blob.selectedStoryId];
  if (!isRecord(record)) return null;
  return { storyId: record.storyId ?? blob.selectedStoryId, pinnedStory: record.pinnedStory ?? null, engineHistory: record.engineHistory ?? null, state: record.state ?? null, visitedPath: record.state?.visitedPath ?? null };
}

const readText = (path: string) => readFileSync(path, 'utf-8');

export const jsonlRows = (text: string) => text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));

function requiredRows(spec: ArtifactSpec, run: RunSpec): number {
  if (spec.minRows === 'cuts') return (run.cuts ?? []).length;
  if (spec.minRows === 'outages') return (run.outages ?? []).length;
  return typeof spec.minRows === 'number' ? spec.minRows : 1;
}

function artifactProblem(path: string, spec: ArtifactSpec, run: RunSpec): string | null {
  if (!existsSync(path)) return `${path} is missing`;
  if (statSync(path).size === 0) return `${path} is empty`;
  const text = readText(path);
  if (!text.trim()) return `${path} is empty`;
  if (spec.kind === 'json') {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch (error) { return `${path} is not JSON: ${error instanceof Error ? error.message : String(error)}`; }
    if (parsed === null || (Array.isArray(parsed) && parsed.length === 0) || (isRecord(parsed) && Object.keys(parsed).length === 0)) return `${path} holds no content`;
    return null;
  }
  if (spec.kind === 'jsonl') {
    let rows: unknown[];
    try { rows = jsonlRows(text); } catch (error) { return `${path} has a malformed row: ${error instanceof Error ? error.message : String(error)}`; }
    const wanted = requiredRows(spec, run);
    if (rows.length < Math.max(1, wanted)) return `${path} has ${rows.length} row(s), needs ${Math.max(1, wanted)} (zero rows is no evidence, not "no anomalies")`;
  }
  return null;
}

export function chatsTouched(dir: string): string[] {
  const path = resolve(dir, 'chats.json');
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readText(path));
    return [...new Set([...(parsed.chats ?? []).map((chat: any) => chat?.chatId), ...(parsed.touched ?? [])].filter((id: unknown): id is string => typeof id === 'string' && id.length > 0))];
  } catch { return []; }
}

export function secondaryChats(dir: string): string[] {
  const path = resolve(dir, 'chats.json');
  if (!existsSync(path)) return [];
  try {
    return (JSON.parse(readText(path)).chats ?? []).filter((chat: any) => !chat?.primary && typeof chat?.chatId === 'string').map((chat: any) => chat.chatId);
  } catch { return []; }
}

export function verifyArtifacts(dir: string, run: RunSpec, doc: RunsDoc): string[] {
  const problems: string[] = [];
  const chats = chatsTouched(dir);
  for (const id of run.artifacts) {
    const spec = doc.artifacts[id];
    if (!spec) { problems.push(`unknown artifact ${id}`); continue; }
    if (spec.perChat) {
      if (!chats.length) { problems.push(`${id}: no chat is recorded in chats.json, so no ${spec.file} can be checked`); continue; }
      for (const chat of chats) {
        const problem = artifactProblem(resolve(dir, spec.file.replace('{chat}', chat)), spec, run);
        if (problem) problems.push(`${id}: ${problem}`);
      }
      continue;
    }
    const problem = artifactProblem(resolve(dir, spec.file), spec, run);
    if (problem) problems.push(`${id}: ${problem}`);
  }
  return problems;
}

const rowsOf = (dir: string, file: string) => {
  const path = resolve(dir, file);
  if (!existsSync(path)) return [];
  try { return jsonlRows(readText(path)); } catch { return []; }
};

export const FORCED_OUTCOMES = new Set(['forced', 'activated', 'failed']);

export const CHAT_SWITCHING_VERBS = new Set(['switch-chat-mid-gen', 'reload-mid-gen']);

export class IntegrationStop extends Error {}

export function chatDriftStop(openChatId: string | null, primaryChatId: string, where: string): string | null {
  return openChatId === primaryChatId ? null : `${where}: the open chat is ${openChatId ?? 'none'}, not the run's chat ${primaryChatId}; the run stops so no turn lands in another chat (T7 I4 seq 73-74)`;
}

export function mutationStop(verb: string, done: { ok?: boolean; problems?: string[] } | null, openChatId: string | null, primaryChatId: string): string | null {
  if (CHAT_SWITCHING_VERBS.has(verb) && done?.ok === false) return `${verb} failed (${(done.problems ?? []).join('; ') || 'no reason given'}): a failed chat switch is a hard stop`;
  return chatDriftStop(openChatId, primaryChatId, `after ${verb}`);
}

export function verifyRun(dir: string, run: RunSpec, doc: RunsDoc, { column = 'on' as Column, attempt = 1 } = {}) {
  if (run.ridesOn) return verifyRider(dir, run, doc, column, attempt);
  const problems = verifyArtifacts(dir, run, doc);
  const rows = rowsOf(dir, 'turns.jsonl');
  for (const row of rows.filter((entry: any) => entry.kind === 'stop')) problems.push(`the run stopped early: ${(row.problems ?? []).join('; ')}`);
  const steps = rows.filter((row: any) => row.kind === 'step');
  const forced = steps.filter((row: any) => FORCED_OUTCOMES.has(row.outcome));
  const failed = steps.filter((row: any) => row.outcome === 'failed');
  const share = steps.length ? forced.length / steps.length : 0;
  if (run.drive?.mode === 'play-then-set' && steps.length === 0) problems.push('turns.jsonl records no route step');
  if (run.drive && share > run.drive.maxForcedShare) problems.push(`${forced.length} of ${steps.length} route steps were forced (${share.toFixed(2)}), above the declared max ${run.drive.maxForcedShare}`);
  for (const row of failed) problems.push(`route step ${row.stepIndex} (${row.expect}) was not reached even after its set and an activation`);
  if (run.mutations) {
    const done = new Set(rows.filter((row: any) => row.kind === 'mutation').map((row: any) => row.verb));
    for (const verb of MUTATION_VERBS) if (!done.has(verb)) problems.push(`mutation ${verb} was never performed`);
  }
  if (run.chats >= 2) {
    for (const chat of secondaryChats(dir)) {
      const path = resolve(dir, `engine-history-${chat}.json`);
      if (!existsSync(path)) continue;
      try {
        const log = JSON.parse(readText(path))?.engineHistory?.log;
        if (Array.isArray(log) && log.length > 0) problems.push(`the never-played chat ${chat} holds ${log.length} boundary(ies): a write landed in another chat`);
      } catch { problems.push(`engine-history-${chat}.json is not JSON`); }
    }
  }
  if (run.outages) {
    const outages = rowsOf(dir, 'outages.jsonl');
    for (const outage of run.outages) {
      const row: any = outages.find((candidate: any) => candidate.service === outage.service && candidate.fromTurn === outage.fromTurn);
      if (!row) { problems.push(`${outage.service} cut at turn ${outage.fromTurn} has no outages.jsonl row`); continue; }
      if (outage.exercisable && !(row.aborted > 0)) problems.push(`${outage.service} cut at turn ${outage.fromTurn} aborted nothing: the cut was vacuous`);
    }
  }
  if (run.cuts?.length) {
    const reopen = rowsOf(dir, 'reopen.jsonl');
    for (const row of reopen as any[]) if (Array.isArray(row.diff) && row.diff.length) problems.push(`reopen after step ${row.afterStep} differs from continuous play: ${row.diff.map((entry: ReopenDiff) => entry.path).join(', ')}`);
    for (const row of reopen as any[]) if (!Array.isArray(row.diff)) problems.push(`reopen after step ${row.afterStep} recorded no diff`);
  }
  return { ok: problems.length === 0, problems, steps: steps.length, forced: forced.length, forcedShare: Number(share.toFixed(3)) };
}

function verifyRider(dir: string, run: RunSpec, doc: RunsDoc, column: Column, attempt: number) {
  const problems: string[] = [];
  let rows = 0;
  for (const host of run.ridesOn ?? []) {
    const hostRun = runById(doc, host);
    const hostDir = resolve(dir, hostDirName(host, column, attempt));
    const path = resolve(hostDir, 'reopen.jsonl');
    if (!existsSync(path) || !readText(path).trim()) { problems.push(`${host}: reopen.jsonl is missing or empty`); continue; }
    const reopen = rowsOf(hostDir, 'reopen.jsonl') as any[];
    rows += reopen.length;
    const wanted = new Set(hostRun?.cuts ?? []);
    for (const cut of wanted) if (!reopen.some((row) => row.afterStep === cut)) problems.push(`${host}: no reopen row for the cut after step ${cut}`);
    if (reopen.length < (run.cutsPerRun ?? 3)) problems.push(`${host}: ${reopen.length} reopen row(s), needs ${run.cutsPerRun ?? 3}`);
    for (const row of reopen) {
      if (!Array.isArray(row.diff)) problems.push(`${host}: reopen after step ${row.afterStep} recorded no diff`);
      else if (row.diff.length) problems.push(`${host}: reopen after step ${row.afterStep} differs: ${row.diff.map((entry: ReopenDiff) => entry.path).join(', ')}`);
    }
  }
  return { ok: problems.length === 0, problems, rows };
}

export function summarizeFindings(rows: any[]): Array<{ seq: number | null; kind: string; problem: string }> {
  const out: Array<{ seq: number | null; kind: string; problem: string }> = [];
  for (const row of rows) for (const problem of row?.problems ?? []) out.push({ seq: row.seq ?? null, kind: String(row.kind ?? 'row'), problem: String(problem) });
  return out;
}
