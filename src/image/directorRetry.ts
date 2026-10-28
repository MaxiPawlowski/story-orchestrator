export const GPU_REFUSAL = /\b409\b|local_residency|not enough free|API request failed|ECONNRESET|fetch failed/i;
export const GPU_BUSY_COPY = "The text model could not load while another image held the GPU, so this picture used the template prompt.";
export const DIRECTOR_FAILED_COPY = "The image-prompt model gave no usable answer, so this picture used the template prompt.";

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const directorIssue = (error: unknown): string => (GPU_REFUSAL.test(message(error)) ? GPU_BUSY_COPY : DIRECTOR_FAILED_COPY);

export async function withDirectorRetry<T>(call: () => Promise<T>, settle: () => Promise<void>): Promise<{ value: T | null; issue: string | null; error?: unknown }> {
  try { return { value: await call(), issue: null }; } catch (first) {
    if (!GPU_REFUSAL.test(message(first))) return { value: null, issue: directorIssue(first), error: first };
    await settle().catch(() => undefined);
    try { return { value: await call(), issue: null }; } catch (second) { return { value: null, issue: directorIssue(second), error: second }; }
  }
}

export async function brokerSettled(status: () => Promise<{ state?: string } | null>, sleep: () => Promise<void>, now: () => number, waitMs = 60_000): Promise<void> {
  const until = now() + waitMs;
  while (now() < until) {
    const state = (await status().catch(() => null))?.state;
    if (state !== "image" && state !== "waiting" && state !== "held") return;
    await sleep();
  }
}
