import { mintToken, type RunContext, type RunOwnership } from "../../src/runtime/runToken";

const TEST_CONTEXT: RunContext = { chatId: "test-chat", storyId: "test-story", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };

/** v2.5 plan 11 I1/I2: ownership is required, so a test that is not about ownership names this one.
 *  It never lapses: the world a run starts in is always still the current one. */
export const testOwnership = (): RunOwnership => ({
  mint: (window) => mintToken(TEST_CONTEXT, window ?? null),
  check: () => ({ ok: true }),
});
