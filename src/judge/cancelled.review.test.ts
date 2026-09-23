// v2.3 plan 03: a cancelled judge call is not a slow one.
//
// The abort work added last turn wires the epoch signal and the request timeout to the SAME
// AbortController in `judgeTransport`, so both surface as an `AbortError` and the error alone
// cannot tell them apart. Everything therefore landed in the call ring as `timeout`.
//
// That is a measurement defect, and plan 11 builds its cost and latency report out of these rings:
// every chat switch during a judge call would have made the model look slower and less reliable
// than it is. The fix is to ask the caller's signal, which only WE abort.
//
// Introduced and found in the same plan — recorded so the distinction is not quietly collapsed
// again by someone simplifying the catch.

import { askJudge } from "./client";
import { choice } from "./questions";
import type { JudgeTransport } from "./types";
import { control } from "../../test/findings/ledger";

const request = {
  state: { scene: "the hall" },
  questions: { location: choice("Where?", { hall: "in the hall", road: "on the road" }) },
};

/** A transport that never answers until whichever signal it was given aborts. */
const hangingTransport: JudgeTransport = (_request, options) => new Promise((_resolve, reject) => {
  const fail = () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    reject(error);
  };
  if (options.signal?.aborted) fail();
  options.signal?.addEventListener("abort", fail);
});

control("a call the model is simply slow to answer is recorded as a timeout", async () => {
  // The baseline. Without it, "cancelled" could be returned for everything and this file would
  // still look green.
  const result = await askJudge(hangingTransport, request, { timeoutMs: 20 });
  expect(result.fallback).toBe("timeout");
  expect(result.answers).toBeNull();
});

control("a call WE cancelled is recorded as cancelled, not as a timeout", async () => {
  const controller = new AbortController();
  const pending = askJudge(hangingTransport, request, { timeoutMs: 5000, signal: controller.signal });
  controller.abort();
  const result = await pending;
  expect(result.fallback).toBe("cancelled");
});

control("a cancelled call still reports how long it ran", async () => {
  // Plan 11 reads latency per call. A cancellation is a real elapsed cost even though no answer
  // came back, so it must not be reported as zero.
  let clock = 1000;
  const controller = new AbortController();
  const pending = askJudge(hangingTransport, request, {
    timeoutMs: 5000,
    signal: controller.signal,
    now: () => { clock += 40; return clock; },
  });
  controller.abort();
  const result = await pending;
  expect(result.fallback).toBe("cancelled");
  expect(result.latencyMs).toBeGreaterThan(0);
});

control("an ordinary failure is still an error, not a cancellation", async () => {
  // The signal exists and is NOT aborted: the transport just broke.
  const controller = new AbortController();
  const broken: JudgeTransport = async () => { throw new Error("plugin 500"); };
  const result = await askJudge(broken, request, { timeoutMs: 5000, signal: controller.signal });
  expect(result.fallback).toBe("error");
});
