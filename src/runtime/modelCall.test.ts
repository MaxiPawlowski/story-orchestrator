jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  sendConnectionProfileRequest: jest.fn(async () => ({ ok: true, text: "answered", finish: "stop" })),
}));

import { sendConnectionProfileRequest } from "@services/STAPI";
import { MODEL_PASSES, type ModelPass } from "@extraction/modelRoute";
import { createModelCall } from "./modelCall";
import { debugResponseFor } from "./modelCallCore";

const send = sendConnectionProfileRequest as jest.Mock;
const GLOBALS: Record<ModelPass, string> = {
  read: "storyOrchestratorDebugExtractionResponse",
  sceneSummary: "storyOrchestratorDebugSceneSummaryResponse",
  shortTerm: "storyOrchestratorDebugShortTermResponse",
  epistemic: "storyOrchestratorDebugEpistemicResponse",
  ledger: "storyOrchestratorDebugLedgerResponse",
  arcSummary: "storyOrchestratorDebugArcSummaryResponse",
  canon: "storyOrchestratorDebugCanonResponse",
  chapterSeal: "storyOrchestratorDebugChapterSealResponse",
  supersession: "storyOrchestratorDebugSupersessionResponse",
  curator: "storyOrchestratorDebugCuratorResponse",
  generation: "storyOrchestratorDebugGenerationResponse",
  critic: "storyOrchestratorDebugGenerationResponse",
  copilot: "storyOrchestratorDebugCopilotResponse",
  director: "storyOrchestratorDebugDirectorResponse",
};
const clearGlobals = () => Object.values(GLOBALS).forEach((name) => Reflect.deleteProperty(globalThis, name));

beforeEach(() => { send.mockClear(); clearGlobals(); });
afterAll(clearGlobals);

describe("the one ModelCall (v2.5 plan 03 D1)", () => {
  it("maps every pass to the one debug response that used to be read at its call site", () => {
    for (const pass of MODEL_PASSES) {
      clearGlobals();
      Reflect.set(globalThis, GLOBALS[pass], `planted ${pass}`);
      expect({ pass, planted: debugResponseFor(pass) }).toEqual({ pass, planted: `planted ${pass}` });
    }
  });

  it("answers a planted pass without sending, and an explicit debug response wins over the global", async () => {
    const model = createModelCall({ settings: () => ({ profileId: "memory" }), exists: () => true });
    Reflect.set(globalThis, GLOBALS.curator, "<think>x</think>[disable] Bridge");
    expect(await model("prompt", { role: "curator", pass: "curator" })).toEqual({ text: "[disable] Bridge", finish: "unknown" });
    expect(await model("prompt", { role: "curator", pass: "curator", debugResponse: "explicit" })).toEqual({ text: "explicit", finish: "unknown" });
    expect(send).not.toHaveBeenCalled();
  });

  it("a measurement model ignores the planted globals", async () => {
    const model = createModelCall({ settings: () => ({ profileId: "memory" }), exists: () => true, planted: false });
    Reflect.set(globalThis, GLOBALS.read, "planted");
    expect(await model("prompt", { role: "read", pass: "read" })).toEqual({ text: "answered", finish: "stop" });
    expect(send.mock.calls[0][0]).toBe("memory");
  });

  it("resolves the route per call from the settings it reads now, not the ones it was built with", async () => {
    let settings: { profileId: string | null; profiles?: { director?: string } } = { profileId: "memory" };
    const model = createModelCall({ settings: () => settings, exists: () => true });
    await model("prompt", { role: "director", pass: "director" });
    settings = { profileId: "memory", profiles: { director: "fast" } };
    await model("prompt", { role: "director", pass: "director", maxTokens: 96 });
    expect(send.mock.calls.map((call) => [call[0], call[2]])).toEqual([["memory", 512], ["fast", 96]]);
  });

  it("refuses a dangling route and a missing profile as config failures that send nothing", async () => {
    const dangling = createModelCall({ settings: () => ({ profileId: "memory", profiles: { curator: "gone" } }), exists: (id) => id === "memory" });
    await expect(dangling("prompt", { role: "curator", pass: "curator" })).rejects.toMatchObject({ name: "ModelCallError", kind: "config", profileId: "gone" });
    const none = createModelCall({ settings: () => ({ profileId: null }), exists: () => true });
    await expect(none("prompt", { role: "read", pass: "read" })).rejects.toMatchObject({ kind: "config" });
    expect(send).not.toHaveBeenCalled();
  });
});
