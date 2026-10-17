export const LANE_MIN = 1;
export const LANE_MAX = 99;

export const isLaneNumber = (n: number): boolean => Number.isInteger(n) && n >= LANE_MIN && n <= LANE_MAX;

export const laneRangeIssue = (value: unknown): string | null => (isLaneNumber(Number(value)) ? null : `lane must be ${LANE_MIN}..${LANE_MAX} (lane 0 is the user's), got ${String(value)}`);
