export const LANE_MIN = 1;
export const LANE_MAX = 99;
export const LANE_ST_BASE = 8100;
export const LANE_CDP_BASE = 9300;

export const RESERVED_PORTS: Readonly<Record<number, string>> = {
  6006: 'Storybook',
  8000: "the owner's SillyTavern",
  8095: 'the local judge',
  8096: 'the local landmarks server',
  8188: 'ComfyUI',
  8765: 'the showcase server',
  9222: 'the shared CDP browser',
  18078: 'the replay backend (so-replay.mts)',
  18079: "offline lanes' closed port",
  18080: 'the pod tunnel',
  18888: 'the local controller',
  18889: 'the local controller',
};

export const isLaneNumber = (n: number): boolean => Number.isInteger(n) && n >= LANE_MIN && n <= LANE_MAX;

export const laneRangeIssue = (value: unknown): string | null => (isLaneNumber(Number(value)) ? null : `lane must be ${LANE_MIN}..${LANE_MAX} (lane 0 is the user's), got ${String(value)}`);

export const lanePorts = (n: number) => ({ st: LANE_ST_BASE + n, cdp: LANE_CDP_BASE + n });

export function lanePortIssue(n: number, reserved: Readonly<Record<number, string>> = RESERVED_PORTS): string | null {
  const { st, cdp } = lanePorts(n);
  for (const [kind, port] of [['ST', st], ['CDP', cdp]] as const) {
    const service = reserved[port];
    if (service) return `lane ${n} refused: its ${kind} port ${port} is reserved for ${service}; pick another lane`;
  }
  return null;
}

export const laneIssue = (value: unknown, reserved: Readonly<Record<number, string>> = RESERVED_PORTS): string | null => laneRangeIssue(value) ?? lanePortIssue(Number(value), reserved);
