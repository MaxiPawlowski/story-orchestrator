import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';

export const PRESET_OVERLAY_PATH = resolve(REPO_ROOT, 'scripts', 'debug', 'adolion-fresh.presets.json');
export const PRESET_OVERLAY_FORMAT = 1;
export const PRESET_OVERLAY_RECORD = 'preset-overlay.json';

export type OverlayKind = 'instruct' | 'textgen';
export type OverlayEdit =
  | { kind: OverlayKind; preset: string; key: string; op: 'set'; value: unknown }
  | { kind: OverlayKind; preset: string; key: string; op: 'moveToFront'; item: string };
export interface PresetOverlay { version: number; about?: string; edits: OverlayEdit[] }

export interface OverlayFs {
  read: (path: string) => Promise<string | null>;
  write: (path: string, text: string) => Promise<void>;
}

export interface MirrorChange { path: string; before: unknown; after: unknown }
export interface EditChange { kind: OverlayKind; preset: string; key: string; op: OverlayEdit['op']; file: string; before: unknown; after: unknown; changed: boolean; mirror: MirrorChange | null }
export interface OverlayRecord {
  overlay: string; sha256: string; applied: boolean; reason: string | null; at: string;
  edits: EditChange[]; problems: string[];
}

const KIND_DIR: Record<OverlayKind, string> = { instruct: 'instruct', textgen: 'TextGen Settings' };
const MIRROR: Record<OverlayKind, string[]> = { instruct: ['power_user', 'instruct'], textgen: ['textgenerationwebui_settings'] };

const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const overlaySha256 = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf-8').digest('hex');

export const presetFile = (user: string, kind: OverlayKind, preset: string) => join(user, KIND_DIR[kind], `${preset}.json`);

export function overlayProblems(overlay: unknown): string[] {
  if (!isRecord(overlay)) return ['the preset overlay is not an object'];
  const problems: string[] = [];
  if (overlay.version !== PRESET_OVERLAY_FORMAT) problems.push(`preset overlay version must be ${PRESET_OVERLAY_FORMAT}`);
  if (!Array.isArray(overlay.edits) || !overlay.edits.length) return [...problems, 'the preset overlay lists no edits'];
  overlay.edits.forEach((edit: any, index: number) => {
    const at = `edits[${index}]`;
    if (!isRecord(edit)) { problems.push(`${at} is not an object`); return; }
    if (!(edit.kind in KIND_DIR)) problems.push(`${at}.kind must be instruct or textgen`);
    if (typeof edit.preset !== 'string' || !edit.preset || /[\\/]/.test(edit.preset)) problems.push(`${at}.preset must be a preset name`);
    if (typeof edit.key !== 'string' || !edit.key) problems.push(`${at}.key must name a key`);
    if (edit.op === 'set') { if (!('value' in edit)) problems.push(`${at} (set) needs a value`); }
    else if (edit.op === 'moveToFront') { if (typeof edit.item !== 'string' || !edit.item) problems.push(`${at} (moveToFront) needs an item`); }
    else problems.push(`${at}.op must be set or moveToFront`);
  });
  return problems;
}

export function applyEdit(edit: OverlayEdit, current: unknown): { after: unknown } | { problem: string } {
  if (edit.op === 'set') {
    if (current !== undefined && typeof current !== typeof edit.value) return { problem: `${edit.preset}.${edit.key} is ${typeof current}, the overlay sets a ${typeof edit.value}` };
    return { after: edit.value };
  }
  if (!Array.isArray(current)) return { problem: `${edit.preset}.${edit.key} is not a list` };
  if (!current.includes(edit.item)) return { problem: `${edit.preset}.${edit.key} does not list ${edit.item}` };
  return { after: [edit.item, ...current.filter((entry) => entry !== edit.item)] };
}

const mirrorHolder = (settings: Record<string, any>, kind: OverlayKind): Record<string, any> | null => {
  const holder = MIRROR[kind].reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), settings);
  return isRecord(holder) ? holder : null;
};

export interface OverlayPlan { files: Record<string, Record<string, any>>; settings: Record<string, any> | null; edits: EditChange[]; problems: string[] }

export function planOverlay(overlay: PresetOverlay, user: string, files: Record<string, unknown>, settings: unknown): OverlayPlan {
  const problems = overlayProblems(overlay);
  if (problems.length) return { files: {}, settings: null, edits: [], problems };
  const out: Record<string, Record<string, any>> = {};
  const nextSettings = isRecord(settings) ? JSON.parse(JSON.stringify(settings)) : null;
  if (!nextSettings) problems.push('settings.json could not be read');
  const edits: EditChange[] = [];
  for (const edit of overlay.edits) {
    const file = presetFile(user, edit.kind, edit.preset);
    const data = out[file] ?? files[file];
    if (!isRecord(data)) { problems.push(`preset ${edit.kind} "${edit.preset}" is missing (${file})`); continue; }
    if (!(edit.key in data)) { problems.push(`preset ${edit.kind} "${edit.preset}" has no key ${edit.key}`); continue; }
    const before = data[edit.key];
    const result = applyEdit(edit, before);
    if ('problem' in result) { problems.push(result.problem); continue; }
    out[file] = { ...data, [edit.key]: result.after };
    let mirror: MirrorChange | null = null;
    const holder = nextSettings ? mirrorHolder(nextSettings, edit.kind) : null;
    if (holder && holder.preset === edit.preset) {
      const mirrorBefore = holder[edit.key];
      const mirrored = applyEdit(edit, mirrorBefore);
      if ('problem' in mirrored) { problems.push(`settings.json (active ${edit.kind} preset): ${mirrored.problem}`); continue; }
      holder[edit.key] = mirrored.after;
      mirror = { path: [...MIRROR[edit.kind], edit.key].join('.'), before: mirrorBefore, after: mirrored.after };
    }
    edits.push({ kind: edit.kind, preset: edit.preset, key: edit.key, op: edit.op, file, before, after: result.after, changed: !same(before, result.after) || Boolean(mirror && !same(mirror.before, mirror.after)), mirror });
  }
  return { files: out, settings: nextSettings, edits, problems };
}

export function readBackProblems(plan: OverlayPlan, files: Record<string, unknown>, settings: unknown): string[] {
  const problems: string[] = [];
  for (const edit of plan.edits) {
    const data = files[edit.file];
    if (!isRecord(data) || !same(data[edit.key], edit.after)) problems.push(`read-back: ${edit.file} ${edit.key} is ${JSON.stringify(isRecord(data) ? data[edit.key] : null)}, expected ${JSON.stringify(edit.after)}`);
    if (edit.mirror) {
      const value = edit.mirror.path.split('.').reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), settings);
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

export async function applyPresetOverlay(user: string, fs: OverlayFs, options: { overlayPath?: string; disabled?: boolean; now?: () => string } = {}): Promise<OverlayRecord> {
  const overlayPath = options.overlayPath ?? PRESET_OVERLAY_PATH;
  const at = (options.now ?? (() => new Date().toISOString()))();
  const text = await fs.read(overlayPath);
  if (text === null) throw new Error(`preset overlay ${overlayPath} is missing`);
  const sha256 = overlaySha256(text);
  if (options.disabled) return { overlay: overlayPath, sha256, applied: false, reason: '--no-preset-overlay', at, edits: [], problems: [] };
  const overlay = parse(text) as PresetOverlay;
  const shapeProblems = overlayProblems(overlay);
  if (shapeProblems.length) throw new Error(`preset overlay ${overlayPath} is invalid:\n- ${shapeProblems.join('\n- ')}`);
  const settingsPath = join(user, 'settings.json');
  const paths = [...new Set(overlay.edits.map((edit) => presetFile(user, edit.kind, edit.preset)))];
  const read = async () => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, parse(await fs.read(path))] as const)));
  const plan = planOverlay(overlay, user, await read(), parse(await fs.read(settingsPath)));
  if (plan.problems.length) throw new Error(`preset overlay refused (nothing written):\n- ${plan.problems.join('\n- ')}`);
  for (const [path, data] of Object.entries(plan.files)) await fs.write(path, presetJson(data));
  if (plan.edits.some((edit) => edit.mirror)) await fs.write(settingsPath, presetJson(plan.settings));
  const back = readBackProblems(plan, await read(), parse(await fs.read(settingsPath)));
  if (back.length) throw new Error(`preset overlay did not read back:\n- ${back.join('\n- ')}`);
  return { overlay: overlayPath, sha256, applied: true, reason: null, at, edits: plan.edits, problems: [] };
}

export interface LivePresets {
  instruct: { preset: string | null; last_output_sequence: unknown; sequences_as_stop_strings?: unknown } | null;
  textgen: { preset: string | null; samplers: unknown } | null }

export interface SessionOverlay { sha256: string | null; applied: boolean; reason: string | null; seededAt: string | null; edits: Array<{ kind: OverlayKind; preset: string; key: string; after: unknown; mirrored: boolean }>; live: LivePresets | null }

export function sessionOverlay(record: OverlayRecord | null, live: LivePresets | null): { overlay: SessionOverlay; problems: string[]; warnings: string[] } {
  if (!record) {
    return {
      overlay: { sha256: null, applied: false, reason: 'the lane was seeded before the preset overlay existed', seededAt: null, edits: [], live },
      problems: [], warnings: ['the lane has no preset-overlay record: it runs the presets copied from the real install (the pre-overlay condition)'],
    };
  }
  const overlay: SessionOverlay = {
    sha256: record.sha256, applied: record.applied, reason: record.reason, seededAt: record.at,
    edits: record.edits.map((edit) => ({ kind: edit.kind, preset: edit.preset, key: edit.key, after: edit.after, mirrored: Boolean(edit.mirror) })), live,
  };
  if (!record.applied) return { overlay, problems: [], warnings: [`the lane was seeded with the preset overlay off (${record.reason ?? 'no reason recorded'})`] };
  const problems: string[] = [];
  for (const edit of record.edits) {
    const holder = edit.kind === 'instruct' ? live?.instruct : live?.textgen;
    if (!holder || holder.preset !== edit.preset) continue;
    const value = (holder as Record<string, unknown>)[edit.key];
    if (!same(value, edit.after)) problems.push(`the page runs ${edit.kind} preset "${edit.preset}" with ${edit.key} = ${JSON.stringify(value)}, the seed's preset overlay wrote ${JSON.stringify(edit.after)}`);
  }
  return { overlay, problems, warnings: [] };
}
