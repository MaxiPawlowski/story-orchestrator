export const CREATE_CONTRACT_ID = "create-B";
export const CREATE_FIXTURE_REVISION = "2";
export const CREATE_FLOORS = { propose: 0.9, none: 1 } as const;

export interface CreateEligibilityRow {
  model: string;
  contract: string;
  revision: string;
  runs: string[];
  propose: number[];
  none: number[];
  measuredAt: string;
}

export const CREATE_ELIGIBILITY: readonly CreateEligibilityRow[] = [
  {
    model: "deepseek:deepseek-flash", contract: CREATE_CONTRACT_ID, revision: CREATE_FIXTURE_REVISION,
    runs: ["test/goldens/live/curator-create-r2/run1", "test/goldens/live/curator-create-r2/run2"],
    propose: [0.4444, 0.6944], none: [1, 1], measuredAt: "2026-10-10",
  },
];

export type CreateEligibilityState = "measured" | "below-floor" | "not-measured" | "unknown-model";

export interface CreateEligibility {
  state: CreateEligibilityState;
  model: string | null;
  detail: string;
}

const passedRow = (row: CreateEligibilityRow) =>
  row.runs.length >= 2 && row.propose.length === row.runs.length && row.none.length === row.runs.length
  && row.propose.every((rate) => rate >= CREATE_FLOORS.propose) && row.none.every((rate) => rate >= CREATE_FLOORS.none);

export function createEligibility(
  model: string | null,
  rows: readonly CreateEligibilityRow[] = CREATE_ELIGIBILITY,
  revision: string = CREATE_FIXTURE_REVISION,
): CreateEligibility {
  if (!model) return { state: "unknown-model", model: null, detail: "the lore creation route names no model, so it cannot match a measurement" };
  const row = rows.find((entry) => entry.model === model && entry.contract === CREATE_CONTRACT_ID && entry.revision === revision);
  if (!row) return { state: "not-measured", model, detail: `${model} has not been measured on ${CREATE_CONTRACT_ID} revision ${revision}` };
  if (!passedRow(row)) return { state: "below-floor", model, detail: `${model} measured below the create floor (propose ${row.propose.join("/")}, none ${row.none.join("/")})` };
  return { state: "measured", model, detail: `${model} passed ${CREATE_CONTRACT_ID} revision ${revision} in ${String(row.runs.length)} runs` };
}

export const routeModelKey = (route: { kind: "profile"; source?: string; model?: string } | { kind: "harness"; harness: string; model: string } | null): string | null => {
  if (!route) return null;
  if (route.kind === "harness") return `${route.harness}:${route.model}`;
  return route.model ? `${route.source ?? "profile"}:${route.model}` : null;
};
