export interface ExperimentContext {
  shared: Map<string, unknown>;
  log: (message: string) => void;
  repeat: number;
}

export interface ExperimentResult {
  id: string;
  title: string;
  summary: string[];
  sections: Array<{ title: string; body: string }>;
  data: unknown;
}

export interface Experiment {
  id: string;
  title: string;
  run: (ctx: ExperimentContext) => Promise<ExperimentResult>;
}
