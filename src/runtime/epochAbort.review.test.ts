// v2.3 plan 03 (§Abort and cleanup): "an epoch bump aborts every signal minted under the old
// epoch".
//
// The token check stops a late result being *written*. This stops the request being *finished*: a
// story load, restart or chat change cancels the call in flight instead of paying for an answer
// that will then be refused.
//
// It only reaches the judge today. SillyTavern's `ConnectionManagerRequestService.sendRequest`
// (shared.js:423) takes `(profileId, prompt, maxTokens, custom, overridePayload)` and DOES honour
// `custom.signal` (shared.js:424, pass-through :463/:483; 1.18.0 :420), so extraction is abortable
// at the host; it is not wired for extraction yet (v2.4 plan 03). Corrected in v2.4 plan 01.

import { RunOwner } from "./runOwner";
import { control } from "../../test/findings/ledger";

const owner = () => new RunOwner({ openChatId: () => "chat-a", storyId: () => "s1", storyHash: () => "h1" });

control("work started now gets a signal that is not yet aborted", () => {
  const run = owner();
  expect(run.signal().aborted).toBe(false);
});

control("replacing the epoch aborts the signal work started under", () => {
  const run = owner();
  const before = run.signal();
  run.bump();
  expect(before.aborted).toBe(true);
});

control("the next epoch gets a fresh signal, not the aborted one", () => {
  // Reusing the aborted controller would cancel every call made after the first bump — a guard
  // that silently disables the judge for the rest of the session.
  const run = owner();
  run.bump();
  const after = run.signal();
  expect(after.aborted).toBe(false);
});

control("each bump aborts only the epoch it replaced", () => {
  const run = owner();
  const first = run.signal();
  run.bump();
  const second = run.signal();
  expect(first.aborted).toBe(true);
  expect(second.aborted).toBe(false);
  run.bump();
  expect(second.aborted).toBe(true);
});

control("the signal is reachable through the ownership seam a coordinator is given", () => {
  // Coordinators never see RunOwner; they get RunOwnership. If the signal is not on that seam it
  // may as well not exist.
  const run = owner();
  const signal = run.ownership.signal?.();
  expect(signal).toBeDefined();
  run.bump();
  expect(signal?.aborted).toBe(true);
});

control("an aborted listener fires once, so a transport can clean up after itself", () => {
  const run = owner();
  let fired = 0;
  run.signal().addEventListener("abort", () => { fired += 1; });
  run.bump();
  run.bump();
  expect(fired).toBe(1);
});
