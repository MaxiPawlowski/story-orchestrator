import { releaseAnswer } from "./gpuLeaseAnswer";

test("a lease the broker no longer holds is not a failed release; a refusal or a broken answer is", () => {
  expect(releaseAnswer(true, { released: true })).toEqual({ ok: true, released: true });
  expect(releaseAnswer(true, { released: false })).toEqual({ ok: true, released: false });
  expect(releaseAnswer(false, { error: "Image work is still running; text remains queued." }).ok).toBe(false);
  expect(releaseAnswer(true, null).ok).toBe(false);
});
