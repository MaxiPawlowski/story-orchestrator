import { judgePicture } from "./judgePicture";
import type { JudgeRuntime } from "@runtime/judge";

const make = (active: boolean, answers: unknown) => ({ active: () => active, ask: jest.fn(async () => ({ answers })) }) as unknown as JudgeRuntime;

test("picture requires both striking and happening now, with a bounded off-path call", async () => {
  const h = make(true, { striking: { type: "score", score: 3.9, confidence: 1, probabilities: {} }, now: { type: "noul", noul: 0.05 } });
  expect(await judgePicture(h, "A remembered spectacle.")).toBe(false);
  expect(h.ask).toHaveBeenCalledWith("pictureCue", expect.anything(), { timeoutMs: 2500 });
  const draw = make(true, { striking: { type: "score", score: 3.9, confidence: 1, probabilities: {} }, now: { type: "noul", noul: 0.95 } });
  expect(await judgePicture(draw, "A spectacle happening now.")).toBe(true);
});

test("picture disabled sends nothing, and unavailable or incomplete answers keep cadence", async () => {
  const off = make(false, {});
  expect(await judgePicture(off, "reply")).toBeNull();
  expect(off.ask).not.toHaveBeenCalled();
  expect(await judgePicture(make(true, null), "reply")).toBeNull();
  expect(await judgePicture(make(true, {}), "reply")).toBeNull();
});
