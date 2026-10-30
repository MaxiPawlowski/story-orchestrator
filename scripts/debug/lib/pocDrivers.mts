import { lanePortIssue } from './laneRange.mts';

export const P41_MARKER = 'SO-P41';
export const POSE_MARKER = 'SO-PL';
export const FLOORS_DATE = '2026-10-14';

export type Mode = 'real' | 'dry';
export type Outcome = 'pass' | 'fail' | 'refused' | 'skipped' | 'stub';

export const JOURNEY_STEPS = [
  'preflight', 'wizard', 'story', 'base', 'prepare', 'expressions', 'frames', 'pose', 'rig', 'poses', 'play', 'look', 'look-rebuild',
  'illustration', 'background', 'swipe', 'delete', 'reload', 'chat-switch', 'stale', 'gpu-idle',
] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];
export const MUTATION_STEPS: readonly JourneyStep[] = ['look', 'swipe', 'delete', 'reload', 'chat-switch'];
export const PER_MEMBER_STEPS: readonly JourneyStep[] = ['base', 'prepare', 'expressions', 'frames', 'rig'];

export const JOURNEY_FLOORS = [
  'every step of JOURNEY_STEPS completes (outcome pass; a refusal or failure is a miss, stub only in --dry)',
  'no stale asset after each mutation (look change, swipe, delete, reload, chat switch) and at the end: displayed sprite paths exist, displayed lineage equals the accepted root, rigs match the shown bust hash, no orphan or missing owned file, no cache key with two hashes',
  'GPU idle after the run: last three 5 s samples at most baseline + 512 MiB and at most 10 % utilisation, no owned ComfyUI job queued',
  'per-step wall time recorded for every step (finite ms)',
  'latency: only floors an existing plan declares (plan 33 Acceptance send->reply within +10 % of the no-sprites arm, measured by so-pose-latency.mts, not by this journey)',
] as const;

export const POSE_FLOORS = [
  'send->reply median of the poses-on arm at most 1.10 x the median of the no-sprites arm, per run (plan 33 §6 Acceptance, predeclared 2026-10-10)',
  'product-path pose renders: every directed (member, pose) of the walked checkpoints shows a posed body on the stage within the run, no render refused',
  'cleanup leaves the owned sprite inventory unchanged against the run baseline (plan 33 §6)',
] as const;

export interface StepRow {
  id: JourneyStep | string;
  member?: string | null;
  outcome: Outcome;
  ms: number;
  startedAt: string;
  detail?: string;
  refusals?: string[];
  data?: unknown;
  thrown?: boolean;
}

export function stepVerdict(rows: StepRow[], mode: Mode, required: readonly string[] = JOURNEY_STEPS): string[] {
  const misses: string[] = [];
  for (const id of required) {
    const mine = rows.filter((row) => row.id === id);
    if (!mine.length) { misses.push(`${id}: not run`); continue; }
    for (const row of mine) {
      const who = row.member ? `${id}[${row.member}]` : id;
      if (!Number.isFinite(row.ms) || row.ms < 0) misses.push(`${who}: no timing`);
      if (row.outcome === 'pass') continue;
      if (row.outcome === 'stub' && mode === 'dry') continue;
      misses.push(`${who}: ${row.outcome}${row.detail ? ` (${row.detail})` : ''}`);
    }
  }
  return misses;
}

export function plumbingProblems(rows: StepRow[], required: readonly string[], cleanup: unknown): string[] {
  const out: string[] = [];
  for (const row of rows) if (row.id === 'abort') out.push(`aborted: ${row.detail ?? ''}`);
  for (const id of required) if (!rows.some((row) => row.id === id)) out.push(`${id}: not run`);
  for (const row of rows) {
    if (row.id === 'abort') continue;
    if (row.thrown) out.push(`${row.id}${row.member ? `[${row.member}]` : ''}: driver error (${row.detail ?? ''})`);
    if (!Number.isFinite(row.ms) || row.ms < 0) out.push(`${row.id}: no timing`);
  }
  const record = cleanup && typeof cleanup === 'object' ? cleanup as { leaked?: unknown; error?: unknown } : null;
  if (record?.error) out.push(`cleanup: ${String(record.error)}`);
  else if (record && typeof record.leaked === 'number' && record.leaked > 0) out.push(`cleanup: ${record.leaked} owned asset(s) leaked`);
  return out;
}

export interface AuthoringRoute { harness: 'claude' | 'opencode'; model: string }

export const AUTHORING_ROUTES: Record<string, AuthoringRoute> = {
  claude: { harness: 'claude', model: 'claude-sonnet-5-5' },
  'claude-opus': { harness: 'claude', model: 'claude-opus-5-5' },
  opencode: { harness: 'opencode', model: 'openai/gpt-6.1-sol' },
};

export function parseAuthoringRoute(spec: string | null | undefined): AuthoringRoute | null {
  if (!spec || spec === 'default') return null;
  const named = AUTHORING_ROUTES[spec];
  if (named) return named;
  const [harness, ...rest] = spec.split(':');
  const model = rest.join(':');
  if ((harness === 'claude' || harness === 'opencode') && model) return { harness, model };
  throw new Error(`--authoring takes default, ${Object.keys(AUTHORING_ROUTES).join(', ')} or <claude|opencode>:<model> (got ${spec})`);
}

export type Provider = 'sol' | 'artemis' | 'judge' | 'comfy' | 'gpu-broker' | 'deepseek' | 'cm-profile' | 'landmarks';

export function classifyCall(url: string, postData: string | null = null): Provider | null {
  const path = (() => { try { return new URL(url, 'http://x').pathname; } catch { return url; } })();
  if (path.startsWith('/api/plugins/story-orchestrator-harness/complete') || path.startsWith('/api/plugins/story-orchestrator-harness/agent/open')
    || path.startsWith('/api/plugins/story-orchestrator-harness/agent/next')) return 'sol';
  if (path.startsWith('/api/plugins/story-orchestrator-judge/') && !path.endsWith('/status')) return 'judge';
  if (path === '/api/plugins/story-orchestrator-media/jobs') return 'comfy';
  if (path === '/api/plugins/story-orchestrator-media/landmarks') return 'landmarks';
  if (path.startsWith('/api/plugins/story-orchestrator-gpu/') && /lease|start-comfy/.test(path)) return 'gpu-broker';
  if (path === '/api/sd/comfy/generate' || path.startsWith('/api/sd/generate')) return 'comfy';
  if (path === '/api/backends/text-completions/generate') return 'artemis';
  if (path === '/api/backends/chat-completions/generate') {
    const source = (() => { try { return String(JSON.parse(postData ?? '{}').chat_completion_source ?? ''); } catch { return ''; } })();
    return source === 'deepseek' ? 'deepseek' : 'cm-profile';
  }
  return null;
}

export function countCalls(rows: Array<{ provider: Provider | null }>): Partial<Record<Provider, number>> {
  const out: Partial<Record<Provider, number>> = {};
  for (const row of rows) if (row.provider) out[row.provider] = (out[row.provider] ?? 0) + 1;
  return out;
}

export interface Sample { at: string; gpuUsedMiB: number | null; gpuUtil: number | null; ramFreeMiB: number; stub?: boolean }

export function parseSmi(line: string): { usedMiB: number; util: number } | null {
  const [used, util] = line.split(',').map((part) => Number(part.trim()));
  return Number.isFinite(used) && Number.isFinite(util) ? { usedMiB: used, util } : null;
}

export function sampleSummary(samples: Sample[]) {
  const used = samples.map((row) => row.gpuUsedMiB).filter((value): value is number => typeof value === 'number');
  const ram = samples.map((row) => row.ramFreeMiB);
  return { count: samples.length, stub: samples.some((row) => row.stub), peakGpuMiB: used.length ? Math.max(...used) : null,
    minRamFreeMiB: ram.length ? Math.min(...ram) : null, lastGpuMiB: used.at(-1) ?? null };
}

export function gpuIdleProblems(samples: Sample[], baselineMiB: number | null, queued: number, { overMiB = 512, utilMax = 10, last = 3 } = {}): string[] {
  const tail = samples.slice(-last);
  if (tail.length < last) return [`only ${tail.length} closing samples (need ${last})`];
  if (tail.some((row) => row.stub)) return [];
  const problems: string[] = [];
  if (baselineMiB === null) problems.push('no baseline GPU sample');
  for (const row of tail) {
    if (row.gpuUsedMiB === null || row.gpuUtil === null) { problems.push(`${row.at}: no GPU reading`); continue; }
    if (baselineMiB !== null && row.gpuUsedMiB > baselineMiB + overMiB) problems.push(`${row.at}: ${row.gpuUsedMiB} MiB used > baseline ${baselineMiB} + ${overMiB}`);
    if (row.gpuUtil > utilMax) problems.push(`${row.at}: ${row.gpuUtil} % utilisation > ${utilMax}`);
  }
  if (queued > 0) problems.push(`${queued} owned ComfyUI job(s) still queued`);
  return problems;
}

export interface InventoryRow { character: string; set: string; label: string; sha256: string; actualHash: string | null; key?: string | null; visualRoot?: string | null }
export interface StageActor { name: string; set: string; path: string | null; pose?: string | null; liveHead?: { look: string; artHash: string } | null }
export interface VisualSourceRow { root: string; looks: Record<string, { root: string; bustSha: string | null; baseSha: string }> }
export interface StaleInput {
  rows: InventoryRow[];
  actors: StageActor[];
  sources: Record<string, VisualSourceRow>;
  owned: (character: string) => boolean;
  served: (path: string) => boolean;
}

export function staleFindings(input: StaleInput): string[] {
  const out: string[] = [];
  const owned = input.rows.filter((row) => input.owned(row.character));
  for (const row of owned) {
    if (row.actualHash === null) out.push(`missing file ${row.character}/${row.set}/${row.label}`);
    else if (row.actualHash !== row.sha256) out.push(`changed file ${row.character}/${row.set}/${row.label}`);
  }
  const byKey = new Map<string, Set<string>>();
  for (const row of owned) if (row.key) byKey.set(row.key, (byKey.get(row.key) ?? new Set()).add(row.sha256));
  for (const [key, hashes] of byKey) if (hashes.size > 1) out.push(`cache key ${key.slice(0, 40)} holds ${hashes.size} hashes`);
  for (const actor of input.actors) {
    if (!input.owned(actor.name)) continue;
    const bare = actor.path?.split('?')[0] ?? null;
    if (actor.path && !input.served(actor.path)) out.push(`${actor.name}: shown path ${bare} is not served`);
    const source = input.sources[actor.name];
    const row = owned.find((item) => item.character === actor.name && item.set === actor.set && bare?.endsWith(`/${item.label}.png`));
    if (source && row?.visualRoot && row.visualRoot !== source.root) out.push(`${actor.name}: shows ${actor.set}/${row.label} from root ${row.visualRoot}, accepted root is ${source.root}`);
    if (actor.liveHead) {
      const bust = source?.looks[actor.liveHead.look]?.bustSha ?? null;
      if (!bust || bust !== actor.liveHead.artHash) out.push(`${actor.name}: live head drawn for look ${actor.liveHead.look} with a rig for art ${actor.liveHead.artHash.slice(0, 12)}, accepted bust ${bust?.slice(0, 12) ?? 'none'}`);
      if (actor.set.startsWith('look_') && actor.liveHead.look === 'default') out.push(`${actor.name}: changed look ${actor.set} still drawn with the default-look rig`);
    }
  }
  for (const [character, source] of Object.entries(input.sources)) {
    if (!input.owned(character)) continue;
    for (const [look, row] of Object.entries(source.looks)) if (row.root !== source.root) out.push(`${character}: look ${look} carries root ${row.root}, accepted ${source.root}`);
  }
  return out;
}

export function staleInputFrom(state: { raw: { sprites: { visualSources: Record<string, any> }; inventory: { rows?: any[] }; actors: StageActor[] }; manifests: Record<string, any[]>; served: Record<string, boolean> },
  owned: (character: string) => boolean): StaleInput {
  const labels = new Map<string, any>();
  for (const [character, sets] of Object.entries(state.manifests)) for (const set of sets ?? []) for (const [label, row] of Object.entries(set?.labels ?? {})) labels.set(`${character}/${set.set}/${label}`, row);
  const rows: InventoryRow[] = (state.raw.inventory.rows ?? []).map((row: any) => {
    const meta = labels.get(`${row.character}/${row.set}/${row.label}`);
    return { character: row.character, set: row.set, label: row.label, sha256: row.sha256, actualHash: row.actualHash ?? null, key: meta?.key ?? null,
      visualRoot: meta?.inputs?.body?.visualRoot ?? meta?.inputs?.visualRoot ?? null };
  });
  const sources = Object.fromEntries(Object.entries(state.raw.sprites.visualSources ?? {}).map(([character, source]: [string, any]) => [character, {
    root: `${source.id}:${source.revision}`,
    looks: Object.fromEntries(Object.entries(source.looks ?? {}).map(([look, row]: [string, any]) => [look, { root: row.root, bustSha: row.bust?.sha256 ?? null, baseSha: row.base?.sha256 }])),
  }]));
  return { rows, actors: state.raw.actors, sources, owned, served: (path) => state.served[path] !== false };
}

export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
export const p90 = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)];
};

export function latencyVerdict(on: number[], off: number[], tolerance = 0.1) {
  const onMedian = median(on), offMedian = median(off);
  const ratio = onMedian !== null && offMedian ? onMedian / offMedian : null;
  return { onMedianMs: onMedian, offMedianMs: offMedian, onP90Ms: p90(on), offP90Ms: p90(off), ratio, limit: 1 + tolerance,
    pass: ratio !== null && ratio <= 1 + tolerance, n: { on: on.length, off: off.length } };
}

export const GPU_MINUTES = {
  journey: { perMember: 15.8, scene: 1, background: 0.5, wizardAndPlay: 0, note: 'R4 serial B estimate 15.8 min/member covers base, 3 expressions, 2 frames, 1 look, 8 poses + 16 posed heads; the journey renders 4 base candidates, 3 expressions, 2 frames, 1 directed pose, 1 look per member, about 6-7 min/member' },
  pose: { perRunOnArm: 25, note: 'arm on renders 4 directed poses x 3 members (12 bodies at ~57-63 s) + their expression heads while Artemis plays; arm off renders nothing' },
} as const;

export function journeyGpuMinutes(members: number, runs: number): number {
  const perMember = 4 * 0.4 + 3 * 0.37 + 2 * 0.35 + 1 * 1.0 + 1 * 0.43 + 0.5;
  return Math.round((members * perMember + 1 + 0.5) * runs * 10) / 10;
}

export interface CastMember { id: string; name: string; description: string; outfit: string; poses: [string, string]; lookValue: string }

export function journeyCast(marker = P41_MARKER): CastMember[] {
  return [
    { id: 'ash', name: `${marker} Ash`, description: 'Ash is a young courier with short red hair and green eyes, in a belted green tunic and tall brown leather boots. Quick, cheerful, talks with her hands.',
      outfit: 'belted green tunic', poses: ['stand_relaxed', 'sit_chair'], lookValue: 'a long navy wool coat over the tunic' },
    { id: 'bram', name: `${marker} Bram`, description: 'Bram is a broad young keeper with short black hair and dark eyes, in silver plate armour and a long blue cape. Slow to speak, dry humour, steady hands.',
      outfit: 'silver plate armour and a long blue cape', poses: ['stand_relaxed', 'sit_edge'], lookValue: 'a yellow oilskin coat over the armour' },
    { id: 'cleo', name: `${marker} Cleo`, description: 'Cleo is a slight young archivist with long silver hair and violet eyes, in a wide purple witch hat and a long purple coat with gold trim. Precise, curious, quietly stubborn.',
      outfit: 'purple witch hat and long purple coat', poses: ['stand_relaxed', 'sit_floor'], lookValue: 'a red scarf over the coat' },
  ];
}

export function journeyGroupName(marker = P41_MARKER): string { return `${marker} Lighthouse`; }

export function journeyStory(cast: CastMember[], marker = P41_MARKER) {
  const slug = marker.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const stage = (pose: number, face: string, framing: string) => ({ framing, cast: Object.fromEntries(cast.map((member) => [member.id, { pose: member.poses[pose], face }])) });
  return {
    id: `${slug}-lighthouse`, title: `${marker} Lighthouse`, description: 'Synthetic plan 41 journey story: three keepers wait out a storm.',
    display: { motion: true },
    player: { role: 'A visitor who reached the lighthouse before the storm', summary: 'You arrive at the lighthouse as the storm closes in.' },
    roster: cast.map((member, index) => ({ id: member.id, name: member.name, role: member.description.split('.')[1]?.trim() || member.name,
      sprites: { pose: member.poses[0], poses: [...member.poses] },
      ...(index === 0 ? { card: { fields: { outfit: { quality: `${member.id}_outfit`, visual: true } } } } : {}) })),
    requirements: { members: cast.map((member) => member.name) },
    qualities: [
      { key: 'storm_bell_rung', type: 'bool', source: 'extractor', rubric: 'Has someone rung the old brass storm bell in the lamp room?' },
      { key: 'lamp_failed', type: 'bool', source: 'extractor', rubric: 'Has the main lighthouse lamp gone completely dark?' },
      { key: `${cast[0].id}_outfit`, type: 'string', source: 'extractor', rubric: `What is ${cast[0].name.replace(`${marker} `, '')} wearing right now? A short clothing description.` },
    ],
    checkpoints: [
      { id: 'arrival', name: 'Arrival', player_name: 'At the door', type: 'anchor', start: true, illustrate: false, objective: 'Meet the keepers at the door.', effects: { stage: stage(0, 'neutral', 'close') } },
      { id: 'table', name: 'At the table', player_name: 'By the stove', type: 'anchor', illustrate: false, objective: 'Sit down together and talk.', effects: { stage: stage(1, 'happy', 'thigh') } },
      { id: 'storm', name: 'The storm', player_name: 'The storm', type: 'anchor', illustrate: false, objective: 'Ride out the worst of the storm.', effects: { stage: stage(0, 'worried', 'close'), card: { [cast[0].id]: { outfit: cast[0].lookValue } } } },
    ],
    transitions: [
      { from: 'arrival', to: 'table', priority: 1, gate: { q: 'storm_bell_rung', op: '==', v: true } },
      { from: 'table', to: 'storm', priority: 1, gate: { q: 'lamp_failed', op: '==', v: true } },
    ],
  };
}

export interface PoseMember { id: string; name: string; description: string; poses: [string, string, string, string]; look: string }

export function poseCast(marker = POSE_MARKER): PoseMember[] {
  return [
    { id: 'ivy', name: `${marker} Ivy`, description: 'Ivy is a tall ranger with a long black braid and a dark green hooded cloak over leather armour.',
      poses: ['stand_arms_crossed', 'sit_chair', 'kneel_one', 'fight_swing'], look: 'a torn grey travelling cloak' },
    { id: 'oren', name: `${marker} Oren`, description: 'Oren is a stocky blacksmith with a shaved head, a thick red beard and a scorched leather apron.',
      poses: ['stand_hands_hips', 'sit_edge', 'fight_guard', 'kneel_pray'], look: 'a blue festival tunic' },
    { id: 'nell', name: `${marker} Nell`, description: 'Nell is a young healer with curly blond hair and freckles, in a white blouse and a brown satchel.',
      poses: ['stand_attention', 'sit_floor', 'cast_two_hands', 'sit_knees_hug'], look: 'a bloodstained apron over the blouse' },
  ];
}

export const POSE_LABELS = ['happy', 'angry', 'worried'] as const;

export function poseStory(cast: PoseMember[], marker = POSE_MARKER) {
  const slug = marker.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const checkpoints = [0, 1, 2, 3].map((at) => ({
    id: `c${at + 1}`, name: `Scene ${at + 1}`, player_name: `Scene ${at + 1}`, type: 'anchor', ...(at === 0 ? { start: true } : {}), illustrate: false,
    objective: 'Talk with the travellers at the forge.',
    effects: {
      stage: { framing: 'thigh', cast: Object.fromEntries(cast.map((member, index) => [member.id, { pose: member.poses[at], face: POSE_LABELS[(at + index) % POSE_LABELS.length] }])) },
      ...(at >= 1 ? { card: { [cast[at - 1].id]: { outfit: cast[at - 1].look } } } : {}),
    },
  }));
  return {
    id: `${slug}-forge`, title: `${marker} Forge`, description: 'Synthetic plan 33 acceptance story: 3 looks x 4 directed poses x 3 labels.',
    display: { motion: true },
    player: { role: 'A traveller waiting out the night at a village forge', summary: 'You share the forge fire with three travellers.' },
    roster: cast.map((member) => ({ id: member.id, name: member.name, role: member.description.split(' is ')[1] ?? member.name,
      sprites: { pose: member.poses[0], poses: [...member.poses] }, card: { fields: { outfit: { quality: `${member.id}_outfit`, visual: true } } } })),
    requirements: { members: cast.map((member) => member.name) },
    qualities: [
      { key: 'forge_bell', type: 'bool', source: 'extractor', rubric: 'Has someone struck the iron bell hanging over the forge door?' },
      ...cast.map((member) => ({ key: `${member.id}_outfit`, type: 'string', source: 'extractor', rubric: `What is ${member.name.replace(`${marker} `, '')} wearing right now?` })),
    ],
    checkpoints,
    transitions: [0, 1, 2].map((at) => ({ from: `c${at + 1}`, to: `c${at + 2}`, priority: 1, gate: { q: 'forge_bell', op: '==', v: true } })),
  };
}

export const armOrder = (run: number): Array<'off' | 'on'> => (run % 2 === 1 ? ['off', 'on'] : ['on', 'off']);
export const checkpointForTurn = (turn: number, turns: number): string => `c${Math.min(4, Math.floor((turn * 4) / Math.max(1, turns)) + 1)}`;

export function directedPoses(cast: PoseMember[], upTo: number): Array<{ member: string; pose: string; checkpoint: string }> {
  return [0, 1, 2, 3].slice(0, upTo).flatMap((at) => cast.map((member) => ({ member: member.name, pose: member.poses[at], checkpoint: `c${at + 1}` })));
}

export function wizardGoal(cast: CastMember[], group: string): string {
  return [`Create exactly these ${cast.length} character cards with these exact names and descriptions, then create one group named "${group}" holding all of them.`,
    ...cast.map((member) => `- "${member.name}": ${member.description}`),
    'Do not change the story title, checkpoints, transitions, qualities or roster; they are already written. Finish when the cards and the group exist.'].join('\n');
}

export function wizardScript(cast: CastMember[], group: string): string[] {
  return [
    JSON.stringify({ plan: [...cast.map((member) => `Create the card ${member.name}`), `Create the group ${group}`] }),
    ...cast.map((member) => JSON.stringify({ tool: 'createCharacterCard', args: { name: member.name, description: member.description } })),
    JSON.stringify({ tool: 'createGroup', args: { name: group, members: cast.map((member) => member.name) } }),
    JSON.stringify({ done: 'Cards and group created.' }),
  ];
}

export function skeletonProblems(draft: any, story: any): string[] {
  const out: string[] = [];
  const ids = (rows: any[] | undefined) => (rows ?? []).map((row) => row.id).join(',');
  if (ids(draft?.checkpoints) !== ids(story.checkpoints)) out.push(`checkpoints changed: ${ids(draft?.checkpoints)}`);
  for (const member of story.roster) if (!(draft?.roster ?? []).some((row: any) => row.name === member.name)) out.push(`roster lost ${member.name}`);
  for (const checkpoint of story.checkpoints) {
    const mine = (draft?.checkpoints ?? []).find((row: any) => row.id === checkpoint.id);
    if (JSON.stringify(mine?.effects?.stage ?? null) !== JSON.stringify(checkpoint.effects.stage)) out.push(`${checkpoint.id}: stage effect changed`);
  }
  return out;
}

export const PLAYER_LINES = [
  'I knock twice and step in out of the rain, shaking water from my hood.',
  'Thank you. Is there somewhere warm I can sit? The road up here was brutal.',
  'I take the chair by the stove and ask how long the three of you have kept this light.',
  'I laugh at that and ask what the worst storm you ever saw was like.',
  'I glance at the window as the wind picks up. Should we be worried?',
  'I help carry the spare lamp oil up from the store room.',
  'I ask Bram whether the light has ever gone out on his watch.',
  'I pass the tea around and ask Cleo what she keeps in all those boxes.',
  'The shutters bang. I ask Ash if she wants to check the door with me.',
  'I sit back down and listen to the storm for a while, then ask for a story.',
  'I thank everyone for the company and offer to take the first night watch.',
  'I look up the stairwell toward the lamp room and ask if I can see it.',
] as const;

export function laneProblem(stUrl: string | undefined, debugDir: string): string | null {
  const port = (() => { try { return Number(new URL(stUrl ?? 'http://127.0.0.1:8000').port || 80); } catch { return 0; } })();
  if (port === 8000) return 'refused: ST_URL is the owner ST (port 8000); run through st-lanes.mts run <n> with n >= 30';
  const lane = port - 8100;
  const reserved = lanePortIssue(lane);
  if (lane >= 30 && lane < 100 && reserved) return `refused: ${reserved}`;
  if (!(lane >= 30 && lane < 100)) return `refused: port ${port} is not a lane >= 30 (8130-8199)`;
  if (/[\\/]0[\\/]debug$/.test(debugDir.replace(/\\/g, '/'))) return 'refused: SO_DEBUG_DIR is lane 0';
  return null;
}

export function evidenceDirName(label: string, run: number, mode: Mode, stamp: string): string {
  return `${stamp.replace(/[:.]/g, '-')}-${label.replace(/[^a-zA-Z0-9_-]/g, '_')}-${mode}-run${run}`;
}
