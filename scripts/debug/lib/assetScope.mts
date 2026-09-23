// V20d part 2 (S8, S9): the pure half of so-assets — argument parsing and which names a cleanup may
// touch — so the narrowing rules are tested without a browser.

export interface AssetsArgs {
  command: string | null;
  marker: string;
  baselineFile: string | null;
  legacyMirrors: string[];
}

const valueAfter = (args: string[], flag: string): string | null => {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
};

/**
 * S8: `--baseline <file>` is explicit. There is deliberately no default: the last journey's baseline
 * file outlives its run, and a stale baseline counts every ledger entry recorded since it was taken as
 * this run's — which widens scope to sessions a real author started in between.
 */
export function parseAssetsArgs(args: string[], defaultMarker: string): AssetsArgs {
  const takesValue = new Set(['--marker', '--baseline', '--legacy-mirrors']);
  const command = args.find((arg, index) => !arg.startsWith('--') && !takesValue.has(args[index - 1] ?? '')) ?? null;
  const legacy = valueAfter(args, '--legacy-mirrors');
  return {
    command,
    marker: valueAfter(args, '--marker') ?? defaultMarker,
    baselineFile: valueAfter(args, '--baseline'),
    legacyMirrors: legacy ? legacy.split('|').map((name) => name.trim()).filter(Boolean) : [],
  };
}

const LEGACY_PREFIX = 'story orchestrator - ';
const CHAT_ID_SUFFIX = / - (\d{4}-\d{2}-\d{2}@\d{2}h\d{2}m\d{2}s\d{1,3}ms|\d{10,})$/i;

/**
 * S9: the fixed-name memory mirrors from before per-chat mirroring (`Story Orchestrator - <title>`).
 * One is deleted only when named EXACTLY, is listed by ST, and carries no chat-id suffix — a per-chat
 * mirror belongs to a chat and is cleaned with it, never by name.
 */
export function legacyMirrorTargets(listed: string[], requested: string[]): { targets: string[]; refused: Array<{ name: string; reason: string }> } {
  const byLower = new Map(listed.map((name) => [name.toLowerCase(), name]));
  const targets: string[] = [];
  const refused: Array<{ name: string; reason: string }> = [];
  for (const name of requested) {
    const lower = name.toLowerCase();
    if (!lower.startsWith(LEGACY_PREFIX)) refused.push({ name, reason: 'not a Story Orchestrator mirror name' });
    else if (CHAT_ID_SUFFIX.test(name)) refused.push({ name, reason: 'a per-chat mirror (chat-id suffix); it is cleaned with its chat' });
    else if (!byLower.has(lower)) refused.push({ name, reason: 'not listed by ST' });
    else if (byLower.get(lower) !== name) refused.push({ name, reason: `listed as "${byLower.get(lower)}", not exactly this name` });
    else if (!targets.includes(name)) targets.push(name);
  }
  return { targets, refused };
}

/** S9: regex scripts and QR sets are in scope by marker prefix only; they carry no ledger. */
export function markerNamed(names: string[], marker: string): string[] {
  const needle = marker.trim().toLowerCase();
  if (!needle) throw new Error('an empty marker matches every name');
  return names.filter((name) => typeof name === 'string' && name.trim().toLowerCase().startsWith(needle));
}
