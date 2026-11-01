export const withDismissal = (dismissed: readonly string[], check: string, on: boolean): string[] =>
  on ? [...new Set([...dismissed, check])] : dismissed.filter((id) => id !== check);
