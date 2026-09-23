// Promoted from the 2026-09-18 external review. R12: the model self-test grades PRESENCE, not
// meaning — any memory line, any arc line, any epistemic entry passes its tier. A model that
// answers fluently about the wrong entities is certified capable, and the settings panel then
// recommends enabling the tiers it just mis-graded. v2.3 plan 01 §A (this plan owns the fix).

import { runModelSelfTest } from "@runtime/selfTest";
import { control, finding, must } from "../../test/findings/ledger";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [] }), sendConnectionProfileRequest: jest.fn() }));
jest.mock("@extraction/client", () => ({
  callExtractionModel: jest.fn(async (_prompt: string, options: { debugResponse?: string }) => options.debugResponse ?? ""),
}));

const goodCore = [
  'DELTA location value="tunnel" evidence="She leads the way into the tunnel"',
  'DELTA has_lantern value=true evidence="I pick up the brass lantern"',
  'MEMORY type=event importance=2 expiration=session text="The party entered the tunnel with the lantern." evidence="we go down"',
  "[arc] The debt owed to Bel for the ferry crossing",
].join("\n");
const goodCapability = "[hiding] Corin from Bel | the letter in his coat\n[state:Corin:character] wound=left arm";

control("the expected fixture semantics pass every tier", async () => {
  const result = await runModelSelfTest({ profileId: "review", debugResponses: [goodCore, goodCapability] });
  expect(result.error).toBeUndefined();
  expect(result.results).toHaveLength(5);
  expect(result.results.every((row) => row.status === "pass")).toBe(true);
});

control("empty output fails every tier", async () => {
  const result = await runModelSelfTest({ profileId: "review", debugResponses: ["NO_DELTA", "NO_DELTA"] });
  expect(result.results.every((row) => row.status === "fail")).toBe(true);
});

finding("R12", async () => {
  // Well-formed, fluent, and about entirely the wrong things: a dragon on the moon, an interstellar
  // chess tournament, a stranger in a purple costume.
  const wrongCore = [
    'DELTA location value="tunnel" evidence="tunnel"',
    'MEMORY type=event importance=2 expiration=session text="A dragon conquered the distant moon." evidence="invented"',
    "[arc] Win the interstellar chess tournament",
  ].join("\n");
  const wrongCapability = "[knows] Stranger | the moon is made of cheese\n[state:Stranger:character] costume=purple";

  const result = await runModelSelfTest({ profileId: "review", debugResponses: [wrongCore, wrongCapability] });
  expect(result.error).toBeUndefined();
  expect(result.results).toHaveLength(5);
  const passed = result.results.filter((row) => row.status === "pass").map((row) => row.tier);
  must(
    passed.length === 0,
    `a response about the wrong entities was certified capable in ${passed.length} tier(s) (${JSON.stringify(passed)}): the grader checks that a tier produced any line at all, not that it produced the right one`,
  );
});
