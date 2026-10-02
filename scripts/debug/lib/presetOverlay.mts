import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';

export const PRESET_OVERLAY_PATH = resolve(REPO_ROOT, 'scripts', 'debug', 'adolion-fresh.presets.json');
export const PRESET_OVERLAY_FORMAT = 2;
export const PRESET_OVERLAY_RECORD = 'preset-overlay.json';
export const THINKING_VARIANT = 'thinking';
export const LIVE_SETTINGS_PATHS = [
  'power_user.user_prompt_bias', 'power_user.show_user_prompt_bias', 'power_user.reasoning.auto_parse', 'power_user.reasoning.name',
  'power_user.reasoning.prefix', 'power_user.reasoning.suffix', 'amount_gen', 'power_user.auto_fix_generated_markdown', 'extension_settings.regex',
] as const;

export type PresetKind = 'instruct' | 'textgen' | 'context';
export type OverlayKind = PresetKind | 'settings' | 'profile';
export type OverlayOp = 'set' | 'moveToFront' | 'activate' | 'upsert';
export interface OverlayEdit { kind: OverlayKind; preset?: string; key?: string; op: OverlayOp; value?: unknown; item?: string; match?: string }
export interface OverlayVariant { about?: string; edits: OverlayEdit[] }
export interface PresetOverlay { version: number; about?: string; default: string; variants: Record<string, OverlayVariant> }

export interface OverlayFs {
  read: (path: string) => Promise<string | null>;
  write: (path: string, text: string) => Promise<void>;
}

export interface MirrorChange { path: string; before: unknown; after: unknown }
export interface EditChange { kind: OverlayKind; preset: string | null; key: string | null; op: OverlayOp; file: string; before: unknown; after: unknown; changed: boolean; mirror: MirrorChange | null; upsert?: { match: string; value: unknown } }
export interface OverlayRecord {
  overlay: string; sha256: string; variant: string | null; applied: boolean; reason: string | null; at: string;
  edits: EditChange[]; problems: string[];
}

const KIND_DIR: Record<PresetKind, string> = { instruct: 'instruct', textgen: 'TextGen Settings', context: 'context' };
const MIRROR: Record<PresetKind, string[]> = { instruct: ['power_user', 'instruct'], textgen: ['textgenerationwebui_settings'], context: ['power_user', 'context'] };
const KINDS: OverlayKind[] = ['instruct', 'textgen', 'context', 'settings', 'profile'];
const PROFILES = ['extension_settings', 'connectionManager', 'profiles'];

const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isPresetKind = (kind: unknown): kind is PresetKind => typeof kind === 'string' && kind in KIND_DIR;
const walk = (root: unknown, path: string[]) => path.reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), root);

export const overlaySha256 = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf-8').digest('hex');

export const presetFile = (user: string, kind: PresetKind, preset: string) => join(user, KIND_DIR[kind], `${preset}.json`);

export const editLabel = (edit: { kind: OverlayKind; preset?: string | null; key?: string | null; op?: OverlayOp }) => {
  if (edit.kind === 'settings') return `settings.json ${edit.key}`;
  if (edit.kind === 'profile') return `profile "${edit.preset}" ${edit.key}`;
  if (edit.op === 'activate') return `${edit.kind} -> "${edit.preset}"`;
  return `${edit.preset}.${edit.key}`;
};

function editProblems(edit: any, at: string): string[] {
  if (!isRecord(edit)) return [`${at} is not an object`];
  const problems: string[] = [];
  if (!KINDS.includes(edit.kind)) problems.push(`${at}.kind must be one of ${KINDS.join(', ')}`);
  if (edit.kind === 'settings') {
    if ('preset' in edit) problems.push(`${at} (settings) names no preset`);
    if (typeof edit.key !== 'string' || !/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/.test(edit.key)) problems.push(`${at}.key must be a dotted settings.json path`);
  } else {
    if (typeof edit.preset !== 'string' || !edit.preset || /[\\/]/.test(edit.preset)) problems.push(`${at}.preset must be a preset name`);
    if (edit.op !== 'activate' && (typeof edit.key !== 'string' || !edit.key)) problems.push(`${at}.key must name a key`);
  }
  if (edit.op === 'set') { if (!('value' in edit)) problems.push(`${at} (set) needs a value`); }
  else if (edit.op === 'moveToFront') {
    if (typeof edit.item !== 'string' || !edit.item) problems.push(`${at} (moveToFront) needs an item`);
    if (!isPresetKind(edit.kind)) problems.push(`${at} (moveToFront) applies to a preset list only`);
  } else if (edit.op === 'activate') {
    if (edit.kind !== 'instruct' && edit.kind !== 'context') problems.push(`${at} (activate) switches an instruct or context preset only`);
    if ('key' in edit) problems.push(`${at} (activate) takes no key`);
  } else if (edit.op === 'upsert') {
    if (edit.kind !== 'settings') problems.push(`${at} (upsert) applies to a settings.json list only`);
    if (typeof edit.match !== 'string' || !edit.match) problems.push(`${at} (upsert) needs a match field`);
    else if (!isRecord(edit.value) || typeof edit.value[edit.match] !== 'string' || !edit.value[edit.match]) problems.push(`${at} (upsert) needs an object value whose ${edit.match} names it`);
  } else problems.push(`${at}.op must be set, moveToFront, upsert or activate`);
  return problems;
}

export function overlayProblems(overlay: unknown): string[] {
  if (!isRecord(overlay)) return ['the preset overlay is not an object'];
  const problems: string[] = [];
  if (overlay.version !== PRESET_OVERLAY_FORMAT) problems.push(`preset overlay version must be ${PRESET_OVERLAY_FORMAT}`);
  if (!isRecord(overlay.variants) || !Object.keys(overlay.variants).length) return [...problems, 'the preset overlay lists no variants'];
  if (typeof overlay.default !== 'string' || !(overlay.default in overlay.variants)) problems.push(`the preset overlay default must name one of its variants (${Object.keys(overlay.variants).join(', ')})`);
  for (const [name, variant] of Object.entries(overlay.variants)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) problems.push(`variant name "${name}" must be lower-case letters, digits and dashes`);
    if (!isRecord(variant) || !Array.isArray(variant.edits) || !variant.edits.length) { problems.push(`variant ${name} lists no edits`); continue; }
    variant.edits.forEach((edit: unknown, index: number) => problems.push(...editProblems(edit, `variants.${name}.edits[${index}]`)));
  }
  return problems;
}

export function variantEdits(overlay: PresetOverlay, variant?: string | null): { name: string; edits: OverlayEdit[] } {
  const name = variant ?? overlay.default;
  if (!(name in overlay.variants)) throw new Error(`the preset overlay has no variant "${name}" (variants: ${Object.keys(overlay.variants).join(', ')})`);
  return { name, edits: overlay.variants[name].edits };
}

export function applyEdit(edit: OverlayEdit, current: unknown): { after: unknown } | { problem: string } {
  if (edit.op === 'set') {
    if (current !== undefined && typeof current !== typeof edit.value) return { problem: `${editLabel(edit)} is ${typeof current}, the overlay sets a ${typeof edit.value}` };
    return { after: edit.value };
  }
  if (!Array.isArray(current)) return { problem: `${editLabel(edit)} is not a list` };
  if (edit.op === 'upsert') {
    const key = edit.match!;
    const name = (edit.value as Record<string, unknown>)[key];
    const at = current.findIndex((entry) => isRecord(entry) && entry[key] === name);
    return { after: at < 0 ? [...current, edit.value] : current.map((entry, index) => (index === at ? edit.value : entry)) };
  }
  if (!current.includes(edit.item)) return { problem: `${editLabel(edit)} does not list ${edit.item}` };
  return { after: [edit.item, ...current.filter((entry) => entry !== edit.item)] };
}

const presetBody = (data: Record<string, any>) => Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'name'));

const findProfile = (settings: unknown, name: string | undefined): Record<string, any> | null => {
  const profiles = walk(settings, PROFILES);
  return Array.isArray(profiles) ? profiles.find((profile) => isRecord(profile) && profile.name === name) ?? null : null;
};

export interface OverlayPlan { files: Record<string, Record<string, any>>; settings: Record<string, any> | null; settingsChanged: boolean; edits: EditChange[]; problems: string[] }

export function planOverlay(edits: OverlayEdit[], user: string, files: Record<string, unknown>, settings: unknown): OverlayPlan {
  const problems: string[] = [];
  const out: Record<string, Record<string, any>> = {};
  const nextSettings = isRecord(settings) ? JSON.parse(JSON.stringify(settings)) : null;
  if (!nextSettings) problems.push('settings.json could not be read');
  const settingsPath = join(user, 'settings.json');
  const changes: EditChange[] = [];
  let settingsChanged = false;
  const record = (edit: OverlayEdit, file: string, before: unknown, after: unknown, mirror: MirrorChange | null) => {
    changes.push({
      kind: edit.kind, preset: edit.preset ?? null, key: edit.key ?? null, op: edit.op, file, before, after, changed: !same(before, after) || Boolean(mirror && !same(mirror.before, mirror.after)), mirror,
      ...(edit.op === 'upsert' ? { upsert: { match: edit.match!, value: edit.value } } : {}),
    });
  };
  for (const edit of edits) {
    if (edit.kind === 'settings' || edit.kind === 'profile') {
      if (!nextSettings) continue;
      const path = edit.kind === 'settings' ? edit.key!.split('.') : [edit.key!];
      const holder = edit.kind === 'settings' ? walk(nextSettings, path.slice(0, -1)) : findProfile(nextSettings, edit.preset);
      const last = path[path.length - 1];
      if (!isRecord(holder)) { problems.push(edit.kind === 'settings' ? `settings.json has no ${path.slice(0, -1).join('.') || '(root)'} for ${edit.key}` : `Connection Manager profile "${edit.preset}" is missing from settings.json`); continue; }
      if (edit.kind === 'settings' && !(last in holder)) { problems.push(`settings.json has no key ${edit.key}`); continue; }
      const before = holder[last];
      const result = applyEdit(edit, before);
      if ('problem' in result) { problems.push(result.problem); continue; }
      holder[last] = result.after;
      settingsChanged = true;
      record(edit, settingsPath, before, result.after, null);
      continue;
    }
    const file = presetFile(user, edit.kind, edit.preset!);
    const data = out[file] ?? files[file];
    if (!isRecord(data)) { problems.push(`preset ${edit.kind} "${edit.preset}" is missing (${file})`); continue; }
    if (edit.op === 'activate') {
      const holder = nextSettings ? walk(nextSettings, MIRROR[edit.kind]) : null;
      if (!isRecord(holder)) { if (nextSettings) problems.push(`settings.json has no active ${edit.kind} (${MIRROR[edit.kind].join('.')}) to switch`); continue; }
      const next = { ...holder, ...presetBody(data), preset: edit.preset };
      const parent = walk(nextSettings, MIRROR[edit.kind].slice(0, -1)) as Record<string, any>;
      parent[MIRROR[edit.kind][MIRROR[edit.kind].length - 1]] = next;
      settingsChanged = true;
      for (const change of changes) {
        if (change.kind !== edit.kind || !change.mirror || change.preset === edit.preset) continue;
        change.mirror = null;
        change.changed = !same(change.before, change.after);
      }
      record(edit, file, holder.preset ?? null, edit.preset, { path: MIRROR[edit.kind].join('.'), before: holder, after: next });
      continue;
    }
    if (!(edit.key! in data)) { problems.push(`preset ${edit.kind} "${edit.preset}" has no key ${edit.key}`); continue; }
    const before = data[edit.key!];
    const result = applyEdit(edit, before);
    if ('problem' in result) { problems.push(result.problem); continue; }
    out[file] = { ...data, [edit.key!]: result.after };
    let mirror: MirrorChange | null = null;
    const holder = nextSettings ? walk(nextSettings, MIRROR[edit.kind]) : null;
    if (isRecord(holder) && holder.preset === edit.preset && edit.key! in holder) {
      const mirrorBefore = holder[edit.key!];
      const mirrored = applyEdit(edit, mirrorBefore);
      if ('problem' in mirrored) { problems.push(`settings.json (active ${edit.kind} preset): ${mirrored.problem}`); continue; }
      holder[edit.key!] = mirrored.after;
      settingsChanged = true;
      mirror = { path: [...MIRROR[edit.kind], edit.key!].join('.'), before: mirrorBefore, after: mirrored.after };
    }
    record(edit, file, before, result.after, mirror);
  }
  return { files: out, settings: nextSettings, settingsChanged, edits: changes, problems };
}

export function readBackProblems(plan: OverlayPlan, files: Record<string, unknown>, settings: unknown): string[] {
  const problems: string[] = [];
  for (const edit of plan.edits) {
    if (edit.kind === 'settings' || edit.kind === 'profile') {
      const value = edit.kind === 'settings' ? walk(settings, edit.key!.split('.')) : findProfile(settings, edit.preset!)?.[edit.key!];
      if (!same(value, edit.after)) problems.push(`read-back: ${editLabel(edit)} is ${JSON.stringify(value)}, expected ${JSON.stringify(edit.after)}`);
      continue;
    }
    const data = files[edit.file];
    if (edit.op === 'activate') {
      const holder = walk(settings, MIRROR[edit.kind as PresetKind]);
      const wrong = !isRecord(holder) || holder.preset !== edit.after || !isRecord(data) || Object.entries(presetBody(data)).some(([key, value]) => !same(holder[key], value));
      if (wrong) problems.push(`read-back: settings.json ${MIRROR[edit.kind as PresetKind].join('.')} is not ${edit.kind} preset "${edit.after}" as its file holds it`);
      continue;
    }
    if (!isRecord(data) || !same(data[edit.key!], edit.after)) problems.push(`read-back: ${edit.file} ${edit.key} is ${JSON.stringify(isRecord(data) ? data[edit.key!] : null)}, expected ${JSON.stringify(edit.after)}`);
    if (edit.mirror) {
      const value = walk(settings, edit.mirror.path.split('.'));
      if (!same(value, edit.mirror.after)) problems.push(`read-back: settings.json ${edit.mirror.path} is ${JSON.stringify(value)}, expected ${JSON.stringify(edit.mirror.after)}`);
    }
  }
  return problems;
}

const parse = (text: string | null): unknown => {
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
};

const presetJson = (data: unknown) => JSON.stringify(data, null, 4);

export async function applyPresetOverlay(user: string, fs: OverlayFs, options: { overlayPath?: string; disabled?: boolean; variant?: string | null; now?: () => string } = {}): Promise<OverlayRecord> {
  const overlayPath = options.overlayPath ?? PRESET_OVERLAY_PATH;
  const at = (options.now ?? (() => new Date().toISOString()))();
  const text = await fs.read(overlayPath);
  if (text === null) throw new Error(`preset overlay ${overlayPath} is missing`);
  const sha256 = overlaySha256(text);
  if (options.disabled) return { overlay: overlayPath, sha256, variant: null, applied: false, reason: '--no-preset-overlay', at, edits: [], problems: [] };
  const overlay = parse(text) as PresetOverlay;
  const shapeProblems = overlayProblems(overlay);
  if (shapeProblems.length) throw new Error(`preset overlay ${overlayPath} is invalid:\n- ${shapeProblems.join('\n- ')}`);
  const { name, edits } = variantEdits(overlay, options.variant);
  const settingsPath = join(user, 'settings.json');
  const paths = [...new Set(edits.filter((edit) => isPresetKind(edit.kind)).map((edit) => presetFile(user, edit.kind as PresetKind, edit.preset!)))];
  const read = async () => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, parse(await fs.read(path))] as const)));
  const plan = planOverlay(edits, user, await read(), parse(await fs.read(settingsPath)));
  if (plan.problems.length) throw new Error(`preset overlay variant ${name} refused (nothing written):\n- ${plan.problems.join('\n- ')}`);
  for (const [path, data] of Object.entries(plan.files)) await fs.write(path, presetJson(data));
  if (plan.settingsChanged) await fs.write(settingsPath, presetJson(plan.settings));
  const back = readBackProblems(plan, await read(), parse(await fs.read(settingsPath)));
  if (back.length) throw new Error(`preset overlay variant ${name} did not read back:\n- ${back.join('\n- ')}`);
  return { overlay: overlayPath, sha256, variant: name, applied: true, reason: null, at, edits: plan.edits, problems: [] };
}

type LiveHolder = ({ preset: string | null } & Record<string, unknown>) | null;
export interface LivePresets {
  instruct: LiveHolder;
  textgen: LiveHolder;
  context?: LiveHolder;
  settings?: Record<string, unknown> | null;
  profile?: ({ name: string | null } & Record<string, unknown>) | null;
}

export interface SessionOverlay {
  sha256: string | null; variant: string | null; applied: boolean; reason: string | null; seededAt: string | null;
  edits: Array<{ kind: OverlayKind; preset: string | null; key: string | null; op: OverlayOp; after: unknown; mirrored: boolean }>; live: LivePresets | null;
}

export const thinkingExpected = (overlay: { applied?: boolean; variant?: string | null } | null | undefined) => overlay?.applied === true && overlay?.variant === THINKING_VARIANT;

function liveProblem(edit: EditChange, live: LivePresets | null): string | null {
  const shown = (value: unknown) => JSON.stringify(value);
  if (edit.kind === 'settings') {
    if (!live?.settings) return null;
    if (!(edit.key! in live.settings)) return `the page did not report ${edit.key}, which the seed's preset overlay wrote`;
    if (edit.upsert) {
      const { match, value } = edit.upsert;
      const name = isRecord(value) ? value[match] : undefined;
      const list = live.settings[edit.key!];
      const found = Array.isArray(list) ? list.find((entry) => isRecord(entry) && entry[match] === name) : undefined;
      const differs = !isRecord(found) || !isRecord(value) || Object.entries(value).some(([field, wanted]) => !same(found[field], wanted));
      return differs ? `the page's ${edit.key} entry ${shown(name)} is ${shown(found ?? null)}, the seed's preset overlay wrote ${shown(value)}` : null;
    }
    return same(live.settings[edit.key!], edit.after) ? null : `the page runs ${edit.key} = ${shown(live.settings[edit.key!])}, the seed's preset overlay wrote ${shown(edit.after)}`;
  }
  if (edit.kind === 'profile') {
    if (!live?.profile || live.profile.name !== edit.preset || !(edit.key! in live.profile)) return null;
    return same(live.profile[edit.key!], edit.after) ? null : `the page's selected profile "${edit.preset}" has ${edit.key} = ${shown(live.profile[edit.key!])}, the seed's preset overlay wrote ${shown(edit.after)}`;
  }
  const holder = live?.[edit.kind as PresetKind] ?? null;
  if (edit.op === 'activate') {
    if (!live) return null;
    return holder?.preset === edit.after ? null : `the page runs ${edit.kind} preset ${shown(holder?.preset ?? null)}, the seed's preset overlay switched it to ${shown(edit.after)}`;
  }
  if (!holder || holder.preset !== edit.preset || !(edit.key! in holder)) return null;
  const value = holder[edit.key!];
  return same(value, edit.after) ? null : `the page runs ${edit.kind} preset "${edit.preset}" with ${edit.key} = ${shown(value)}, the seed's preset overlay wrote ${shown(edit.after)}`;
}

export function profileProblems(record: OverlayRecord | null, mainProfile: string): string[] {
  if (!record?.applied) return [];
  const edited = [...new Set(record.edits.filter((edit) => edit.kind === 'profile').map((edit) => edit.preset))];
  if (!edited.length || edited.includes(mainProfile)) return [];
  return [`the preset overlay (${record.variant ?? 'fix'}) wrote profile(s) ${edited.map((name) => `"${name}"`).join(', ')}, but the session selects "${mainProfile}", whose own instruct and Start Reply With would replace the overlay's on selection`];
}

export function sessionOverlay(record: OverlayRecord | null, live: LivePresets | null): { overlay: SessionOverlay; problems: string[]; warnings: string[] } {
  if (!record) {
    return {
      overlay: { sha256: null, variant: null, applied: false, reason: 'the lane was seeded before the preset overlay existed', seededAt: null, edits: [], live },
      problems: [], warnings: ['the lane has no preset-overlay record: it runs the presets copied from the real install (the pre-overlay condition)'],
    };
  }
  const variant = record.applied ? record.variant ?? 'fix' : null;
  const overlay: SessionOverlay = {
    sha256: record.sha256, variant, applied: record.applied, reason: record.reason, seededAt: record.at,
    edits: record.edits.map((edit) => ({ kind: edit.kind, preset: edit.preset ?? null, key: edit.key ?? null, op: edit.op ?? 'set', after: edit.after, mirrored: Boolean(edit.mirror) })), live,
  };
  if (!record.applied) return { overlay, problems: [], warnings: [`the lane was seeded with the preset overlay off (${record.reason ?? 'no reason recorded'})`] };
  const problems = record.edits.map((edit) => liveProblem(edit, live)).filter((line): line is string => Boolean(line));
  return { overlay, problems, warnings: [] };
}
