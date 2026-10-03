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
  prior?: string;
  why?: string;
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
}

export const REQUIRES_KEYS = new Set(['lane', 'group', 'members', 'authorView', 'judge', 'mainApi', 'roleProfiles', 'macroEngine', 'vectorsWorldInfo', 'prior', 'why']);
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
