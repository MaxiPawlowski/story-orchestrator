export const JOURNEY_ARM_FLAGS = ['--judge-uses', '--warden-mode'] as const;
const WARDEN_MODES = ['auto', 'review'];

export function journeyArmProblems(args: unknown): string[] {
  if (args === undefined) return [];
  if (!Array.isArray(args) || !args.length) return ['args must be a non-empty array of flag/value pairs'];
  if (args.length % 2) return [`args must be flag/value pairs (got ${args.length} entries)`];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const [flag, value] = [args[index], args[index + 1]];
    if (!(JOURNEY_ARM_FLAGS as readonly unknown[]).includes(flag)) { problems.push(`args: ${JSON.stringify(flag)} is not one of ${JOURNEY_ARM_FLAGS.join(', ')}`); continue; }
    if (seen.has(flag)) problems.push(`args: ${flag} given twice`);
    seen.add(flag);
    if (typeof value !== 'string' || !value || value.startsWith('--') || /\s/.test(value)) problems.push(`args: ${flag} needs one value without spaces (got ${JSON.stringify(value)})`);
    else if (flag === '--warden-mode' && !WARDEN_MODES.includes(value)) problems.push(`args: --warden-mode must be ${WARDEN_MODES.join(' or ')} (got ${value})`);
  }
  if (seen.has('--warden-mode') && !seen.has('--judge-uses')) problems.push('args: --warden-mode is an on-arm setting and needs --judge-uses');
  return problems;
}

export const journeyItem = (target: string, args?: string[]): string => (args?.length ? [target, ...args].join(' ') : target);

export function splitJourneyItem(item: string): { id: string; args: string[] } {
  const [id = '', ...args] = item.trim().split(/\s+/);
  return { id, args };
}
