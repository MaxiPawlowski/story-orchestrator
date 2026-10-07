import { DISCOVERY_NEEDS, IMAGE_NEEDS, type ImageNeed } from './imageHarnessConfig.mts';

export type LaneKind = 'no-model' | 'model';

export interface ScenarioRequires {
  lane?: LaneKind;
  group?: string;
  members?: string[];
  authorView?: boolean;
  judge?: 'off';
  mainApi?: string;
  roleProfiles?: 'text-completion';
  macroEngine?: boolean;
  vectorsWorldInfo?: boolean;
  comfy?: true;
  imageHarness?: ImageNeed[];
  prior?: string;
  why?: string;
}

export interface ComfyFacts {
  cleared: boolean;
  plugin: 'present' | 'absent' | 'error' | null;
  discovered: { diffusionModels: string[]; textEncoders: string[]; vaes: string[]; checkpoints: string[]; alpha: string[] } | null;
  probe: string | null;
}

export interface HarnessFacts {
  path: string;
  gaps: string[];
  config: { editModels?: { diffusion: string; encoder: string; vae: string }; backgroundRemoval?: string; raterProfile?: string; controllerUrl?: string; localProfiles?: { main: string; memory: string } } | null;
}

export interface RequiresFacts {
  groupId?: string | null;
  groupName?: string | null;
  members?: Array<{ name: string; avatar: string; disabled: boolean }>;
  mainApi?: string | null;
  roleModes?: Record<string, string | null>;
  macroEngine?: boolean | null;
  vectorsWorldInfo?: boolean | null;
  modelReachable?: boolean | null;
  modelProbe?: string | null;
  comfy?: ComfyFacts | null;
  harness?: HarnessFacts | null;
  profileNames?: string[];
}

export const REQUIRES_KEYS = new Set(['lane', 'group', 'members', 'authorView', 'judge', 'mainApi', 'roleProfiles', 'macroEngine', 'vectorsWorldInfo', 'comfy', 'imageHarness', 'prior', 'why']);
export const LANE_KINDS = new Set<LaneKind>(['no-model', 'model']);
export const MAIN_APIS = new Set(['textgenerationwebui', 'openai', 'kobold', 'novel', 'koboldhorde']);

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function validateRequires(value: unknown, where = 'requires'): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return [`${where}: expected an object`];
  const problems: string[] = [];
  const keys = Object.keys(value);
  if (!keys.length) problems.push(`${where}: empty requires object — state a condition or drop it`);
  for (const key of keys) if (!REQUIRES_KEYS.has(key)) problems.push(`${where}: unknown key "${key}" (known: ${[...REQUIRES_KEYS].join(', ')})`);
  if ('lane' in value && !LANE_KINDS.has(value.lane as LaneKind)) problems.push(`${where}.lane: expected "no-model" or "model", got ${JSON.stringify(value.lane)}`);
  for (const key of ['group', 'prior', 'why']) if (key in value && !nonEmpty(value[key])) problems.push(`${where}.${key}: expected a non-empty string`);
  if ('members' in value && (!Array.isArray(value.members) || !value.members.length || value.members.some((name) => !nonEmpty(name)))) problems.push(`${where}.members: expected a non-empty list of member names`);
  if ('members' in value && !('group' in value)) problems.push(`${where}.members: name the group the members belong to (requires.group)`);
  for (const key of ['authorView', 'macroEngine', 'vectorsWorldInfo']) if (key in value && typeof value[key] !== 'boolean') problems.push(`${where}.${key}: expected true or false`);
  if ('authorView' in value && value.authorView !== true) problems.push(`${where}.authorView: only true is a requirement (player mode is the default)`);
  if ('judge' in value && value.judge !== 'off') problems.push(`${where}.judge: only "off" is a requirement (judge on is the install default since v2.6 rule 5)`);
  if ('mainApi' in value && !MAIN_APIS.has(String(value.mainApi))) problems.push(`${where}.mainApi: expected one of ${[...MAIN_APIS].join(', ')}`);
  if ('roleProfiles' in value && value.roleProfiles !== 'text-completion') problems.push(`${where}.roleProfiles: only "text-completion" is a requirement`);
  if ('comfy' in value && value.comfy !== true) problems.push(`${where}.comfy: only true is a requirement`);
  if (value.comfy === true && value.lane !== 'model') problems.push(`${where}.comfy: a ComfyUI scenario declares lane "model", so a no-model batch never reaches ComfyUI`);
  if ('imageHarness' in value) {
    const needs = value.imageHarness;
    if (!Array.isArray(needs) || !needs.length || needs.some((need) => !(IMAGE_NEEDS as readonly string[]).includes(need))) problems.push(`${where}.imageHarness: expected a non-empty list of ${IMAGE_NEEDS.join(', ')}`);
    else if (needs.some((need) => DISCOVERY_NEEDS.has(need)) && value.comfy !== true) problems.push(`${where}.imageHarness: ${needs.filter((need) => DISCOVERY_NEEDS.has(need)).join(', ')} are checked against ComfyUI discovery: add requires.comfy`);
  }
  return problems;
}

export const requiresOf = (doc: unknown): ScenarioRequires => (isRecord(doc) && isRecord(doc.requires) ? doc.requires as ScenarioRequires : {});

export function requiredGroup(requires: ScenarioRequires, cliGroup: string | null): { group: string | null; overridden: boolean } {
  if (requires.group) return { group: requires.group, overridden: Boolean(cliGroup) && cliGroup !== requires.group };
  return { group: cliGroup, overridden: false };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const memberMatches = (member: { name: string; avatar: string }, wanted: string) => sameName(member.name, wanted) || sameName(member.avatar.replace(/\.[a-z]+$/i, ''), wanted);

export function membersToEnable(requires: ScenarioRequires, facts: RequiresFacts): string[] {
  return (requires.members ?? []).flatMap((wanted) => (facts.members ?? []).filter((member) => member.disabled && memberMatches(member, wanted)).map((member) => member.avatar));
}

export function requiresProblems(requires: ScenarioRequires, facts: RequiresFacts): string[] {
  const problems: string[] = [];
  if (requires.prior) problems.push(`needs a prior step outside this file: ${requires.prior}`);
  if (requires.group && !(facts.groupId && (facts.groupId === requires.group || sameName(facts.groupName ?? '', requires.group)))) problems.push(`needs group "${requires.group}", the open group is ${facts.groupName ? `"${facts.groupName}" (${facts.groupId})` : 'none'}`);
  for (const wanted of requires.members ?? []) {
    const member = (facts.members ?? []).find((entry) => memberMatches(entry, wanted));
    if (!member) problems.push(`needs ${wanted} in the group, members are ${JSON.stringify((facts.members ?? []).map((entry) => entry.name))}`);
    else if (member.disabled) problems.push(`needs ${wanted} enabled in the group, and it is still disabled`);
  }
  if (requires.mainApi && facts.mainApi !== requires.mainApi) problems.push(`needs main API ${requires.mainApi}, the install uses ${facts.mainApi ?? 'unknown'}`);
  if (requires.roleProfiles === 'text-completion') {
    const off = Object.entries(facts.roleModes ?? {}).filter(([, mode]) => mode !== 'tc');
    if (!facts.roleModes || !Object.keys(facts.roleModes).length) problems.push('needs every orchestrator role on a Text Completion profile, and the routing could not be read');
    else if (off.length) problems.push(`needs every orchestrator role on a Text Completion profile: ${off.map(([role, mode]) => `${role}=${mode ?? 'unrouted'}`).join(', ')}`);
  }
  if (typeof requires.macroEngine === 'boolean' && facts.macroEngine !== requires.macroEngine) problems.push(`needs experimental_macro_engine ${requires.macroEngine ? 'on' : 'off'} (it is read at startup: switch it and reload), it is ${facts.macroEngine ? 'on' : 'off'}`);
  if (typeof requires.vectorsWorldInfo === 'boolean' && facts.vectorsWorldInfo !== requires.vectorsWorldInfo) problems.push(`needs Vectors > World Info ${requires.vectorsWorldInfo ? 'on' : 'off'}, it is ${facts.vectorsWorldInfo ? 'on' : 'off'}`);
  if (requires.lane === 'no-model' && facts.modelReachable !== false) problems.push(`needs a no-model lane (st-lanes.mts no-model <n>: keys removed, judge off), and the memory profile ${facts.modelReachable ? 'answered' : 'could not be probed'}${facts.modelProbe ? ` (${facts.modelProbe})` : ''}`);
  if (requires.lane === 'model' && facts.modelReachable !== true) problems.push(`needs a lane with a live model, and the memory profile did not answer${facts.modelProbe ? ` (${facts.modelProbe})` : ''}`);
  if (requires.comfy) problems.push(...comfyProblems(facts.comfy ?? null));
  if (requires.imageHarness?.length) problems.push(...harnessProblems(requires.imageHarness, facts));
  return problems;
}

export function comfyProblems(comfy: ComfyFacts | null): string[] {
  if (!comfy?.cleared) return ['needs a lane cleared for ComfyUI (SO_ALLOW_COMFY=1, or "allowComfy": true in the lane image-harness config): a lane never reaches ComfyUI unless it says so'];
  if (comfy.plugin === 'absent') return ['needs the story-orchestrator-media server plugin, and /api/plugins/story-orchestrator-media/status answered 404'];
  if (comfy.plugin !== 'present') return [`needs the story-orchestrator-media server plugin, and its status could not be read${comfy.probe ? ` (${comfy.probe})` : ''}`];
  if (!comfy.discovered) return [`needs ComfyUI reachable through the media plugin, and discovery did not answer${comfy.probe ? ` (${comfy.probe})` : ''}`];
  return [];
}

export function harnessProblems(needs: ImageNeed[], facts: RequiresFacts): string[] {
  const harness = facts.harness;
  if (!harness) return ['needs the lane image-harness config, and it was not read'];
  if (harness.gaps.length) return harness.gaps;
  const config = harness.config ?? {};
  const found = facts.comfy?.discovered;
  const problems: string[] = [];
  if (needs.includes('editModels') && config.editModels && found) {
    const lists: Record<string, string[]> = { diffusion: found.diffusionModels, encoder: found.textEncoders, vae: found.vaes };
    for (const [field, name] of Object.entries(config.editModels)) if (!lists[field]?.includes(name)) problems.push(`needs the ${field} model "${name}" in ComfyUI, discovery does not list it`);
  }
  if (needs.includes('backgroundRemoval') && config.backgroundRemoval && found && !found.alpha.includes(config.backgroundRemoval)) {
    problems.push(`needs the background-removal recipe "${config.backgroundRemoval}", the media plugin offers ${JSON.stringify(found.alpha)}`);
  }
  const profiles = facts.profileNames ?? [];
  if (needs.includes('rater') && config.raterProfile && !profiles.includes(config.raterProfile)) problems.push(`needs the rater profile "${config.raterProfile}" in Connection Manager`);
  if (needs.includes('localProfiles') && config.localProfiles) {
    for (const name of [config.localProfiles.main, config.localProfiles.memory]) if (!profiles.includes(name)) problems.push(`needs the local profile "${name}" in Connection Manager`);
  }
  return problems;
}

export const STORY_LOADING_VERBS = new Set(['import_story', 'select_story', 'restart_story', 'seed_metadata', 'reload']);

export const AUTHOR_VIEW_STEP = { eval: "const rt = globalThis.storyOrchestratorRuntime; rt.setUiSettings({ authorView: true }); if (rt.getSnapshot()?.ui?.authorView !== true) throw new Error('requires.authorView: Author view did not switch on after the story loaded'); return { authorView: true };" };

export function withAuthorView(steps: unknown[], requires: ScenarioRequires): unknown[] {
  if (!requires.authorView) return steps;
  return steps.flatMap((step) => {
    const verb = step && typeof step === 'object' ? Object.keys(step).find((key) => STORY_LOADING_VERBS.has(key)) : undefined;
    return verb ? [step, AUTHOR_VIEW_STEP] : [step];
  });
}

export const NOT_RUNNABLE = 'not-runnable';

export const notRunnableLine = (problems: string[]) => `${NOT_RUNNABLE}: ${problems.join('; ')}`;

export function laneOf(requires: ScenarioRequires, fallback: LaneKind = 'model'): LaneKind {
  return requires.lane ?? fallback;
}
