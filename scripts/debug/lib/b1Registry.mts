export interface B1Runner {
  row: string;
  runner: string;
  command: string;
  scorer: string;
}

export const B1_RUNNERS: readonly B1Runner[] = [
  { row: '35-M2', runner: 'scripts/debug/so-b1-hooks.mts', command: 'label --runs <runs.json> --labeller <profile> --run <n>', scorer: 'scripts/debug/lib/hookScore.mts' },
  { row: '35-M2-C5', runner: 'scripts/debug/so-b1-hooks.mts', command: 'label --row 35-M2-C5 --runs <runs.json> --labeller <profile> --run <n>', scorer: 'scripts/debug/lib/hookScore.mts' },
  { row: '36-Q1-M1', runner: 'scripts/debug/so-b1-quest-scope.mts', command: 'm1 --lab <lab/quests> --profile <read profile> --run <n>', scorer: 'scripts/debug/lib/questScope.mts' },
  { row: '36-Q1-M2', runner: 'scripts/debug/so-b1-quest-scope.mts', command: 'm2 --lab <lab/quests> --profile <read profile> --run <n>', scorer: 'scripts/debug/lib/questScope.mts' },
  { row: '37-M1', runner: 'scripts/debug/so-b1-life-reads.mts', command: 'm1 --lab <lab/life> --profile <read profile> --run <n>', scorer: 'scripts/debug/lib/lifeReads.mts' },
  { row: '37-M1-C5', runner: 'scripts/debug/so-b1-life-reads.mts', command: 'm1 --row 37-M1-C5 --lab <lab/life> --profile <read profile> --run <n>', scorer: 'scripts/debug/lib/lifeReads.mts' },
  { row: '37-M2', runner: 'scripts/debug/so-b1-life-reads.mts', command: 'm2 --lab <lab/life> --profile <read profile> --run <n>', scorer: 'scripts/debug/lib/lifeReads.mts' },
  { row: 'S-17', runner: 'scripts/debug/so-b1-combined-scope.mts', command: 'run --row S-17 --lab <lab/life> --profile <read profile> --run <n>', scorer: 'scripts/debug/lib/combinedScope.mts' },
  { row: '37-S17', runner: 'scripts/debug/so-b1-combined-scope.mts', command: 'run --row 37-S17 --lab <lab/life> --profile <read profile> --run <n>', scorer: 'scripts/debug/lib/combinedScope.mts' },
  { row: '37-L3', runner: 'scripts/debug/so-b1-meanwhile.mts', command: 'run --profile <curator profile> --labeller <profile> --run <n>', scorer: 'scripts/debug/lib/meanwhileReplay.mts' },
  { row: '37-L6-C', runner: 'scripts/debug/so-judge.mts', command: 'calibrate --use warden-voice --lab <lab/life> --run <n>', scorer: 'scripts/debug/lib/voiceScore.mts' },
  { row: 'B1-C3', runner: 'scripts/debug/so-b1-judge-causes.mts', command: 'follow --out <calls.jsonl> during the play, then score --row B1-C3 --calls <journal-follow.jsonl> --samples <calls.jsonl> --turns <turns.jsonl> --run <n>', scorer: 'scripts/debug/lib/judgeCauses.mts' },
  { row: 'B1-C12', runner: 'scripts/debug/so-b1-judge-causes.mts', command: 'score --row B1-C12 --calls <journal-follow.jsonl> --turns <turns.jsonl> --run <n>', scorer: 'scripts/debug/lib/judgeCauses.mts' },
];

export const runnerFor = (row: string): B1Runner | null => B1_RUNNERS.find((entry) => entry.row === row) ?? null;
