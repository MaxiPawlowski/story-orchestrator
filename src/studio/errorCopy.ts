export const studioFailureText = (what: string): string => `${what}. Try again; the details are in the browser console.`;

export const studioFailure = (what: string, caught: unknown): string => {
  console.warn(`[Story Orchestrator] ${what}`, caught);
  return studioFailureText(what);
};
