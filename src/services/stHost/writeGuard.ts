export interface WriteGuard {
  stillOwns(): boolean;
}

export const RUN_LAPSED = "the run that asked for this write ended before it could write, so nothing was written";

export const lapsed = (guard: WriteGuard | undefined): boolean => guard !== undefined && !guard.stillOwns();
