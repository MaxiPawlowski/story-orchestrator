// V20d part 2 (S8, S9): the pure half of so-assets — argument parsing and which names a cleanup may
// touch — so the narrowing rules are tested without a browser.

export interface AssetsArgs {
  command: string | null;
  marker: string;
  baselineFile: string | null;
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
  const takesValue = new Set(['--marker', '--baseline']);
  const command = args.find((arg, index) => !arg.startsWith('--') && !takesValue.has(args[index - 1] ?? '')) ?? null;
  return {
    command,
    marker: valueAfter(args, '--marker') ?? defaultMarker,
    baselineFile: valueAfter(args, '--baseline'),
  };
}

/** S9: regex scripts and QR sets are in scope by marker prefix only; they carry no ledger. */
export function markerNamed(names: string[], marker: string): string[] {
  const needle = marker.trim().toLowerCase();
  if (!needle) throw new Error('an empty marker matches every name');
  return names.filter((name) => typeof name === 'string' && name.trim().toLowerCase().startsWith(needle));
}
