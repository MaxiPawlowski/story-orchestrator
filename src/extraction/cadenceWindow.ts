// Cadence counts BOUNDARIES, and the window used to count
// MESSAGES: `cadence` of them ending at the stable end. At cadence 1 a read saw only the newest reply,
// never the player's line before it; in a group, several replies per line pushed the player's own
// words out of every window; in a solo chat at cadence 3, half the transcript was never read. A
// cadence read now starts where the previous one ended. With no cursor (the first read, a new world,
// or a chat a rollback made shorter than the cursor) it reads the same span the default shared read
// does, and no read spans more than CADENCE_WINDOW_MAX messages, so a long pause cannot send the
// whole chat as one prompt.
export const CADENCE_WINDOW_FALLBACK = 8;
export const CADENCE_WINDOW_MAX = 24;

export const cadenceWindowFrom = (cursor: number | null, stableTo: number): number => {
  const from = cursor !== null && cursor < stableTo ? cursor + 1 : stableTo - CADENCE_WINDOW_FALLBACK + 1;
  return Math.max(0, from, stableTo - CADENCE_WINDOW_MAX + 1);
};
