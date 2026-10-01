import { defaultJudgeSettings, type JudgeResponse, type JudgeSettings, type JudgeTransport } from "@judge/index";
import { JudgeRuntime } from "./judge";
import { createJudgeHarness } from "./judgeHarness";
import { testOwnership } from "../../test/findings/testOwnership";

const answered: JudgeResponse = { model: "llama-server:artemis", answers: { q: { type: "noul", noul: 0.9 } } };
const request = { state: { a: 1 }, questions: { q: { type: "noul" as const, instructions: "q?" } } };

const setup = (initial: JudgeSettings) => {
  const typesafe = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(async () => ({ ...answered, model: "jev-1.13.0" }));
  const llama = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(async () => answered);
  const runtime = new JudgeRuntime({
    ownership: testOwnership(),
    getSettings: () => initial,
    transport: typesafe,
    providers: { "llama-logprob": llama },
    status: async () => ({ configured: true, providers: { typesafe: { configured: true }, "llama-logprob": { configured: true } } }),
    record: () => undefined,
    context: () => ({ boundary: 1, messageId: 1 }),
  });
  const harness = createJudgeHarness(runtime);
  return { harness, typesafe, llama };
};

describe("AS-17: the calibration harness carries the provider", () => {
  it("a llama calibration never hits TypeSafe (negative control)", async () => {
    const { harness, typesafe, llama } = setup(defaultJudgeSettings());
    const cases = [{ id: "d1", input: { checkpointName: "Gate", objective: "Open", player: "Max", candidates: [{ rosterId: "a", name: "Mara", role: "captain" }, { rosterId: "b", name: "Finn", role: "scholar" }], allowSilence: false, window: [] }, expected: "Mara" }];
    await harness.calibrate("director", cases, undefined, "llama-logprob");
    expect(llama).toHaveBeenCalled();
    expect(typesafe).not.toHaveBeenCalled();
  });

  it("probe, rescore and lore relevance route to the named provider, and the default stays TypeSafe", async () => {
    const { harness, typesafe, llama } = setup(defaultJudgeSettings());
    await harness.probe(request, undefined, "llama-logprob");
    await harness.rescore("continuity", [], undefined, "llama-logprob");
    await harness.calibrateLoreRelevance([], undefined, "llama-logprob");
    expect(typesafe).not.toHaveBeenCalled();
    expect(llama).toHaveBeenCalledTimes(1);
    await harness.probe(request);
    expect(typesafe).toHaveBeenCalledTimes(1);
  });
});
