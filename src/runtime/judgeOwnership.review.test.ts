// C1, from the v2.2 integration review: a late judge result carries no chat or session identity.
//
// `JudgeRuntime.ask` reads `deps.context()` AFTER awaiting the model, so the call-ring row is
// stamped with whatever boundary and message the runtime is on when the answer lands — and
// `deps.record` writes into whichever chat's ring is current then. A call started in chat A can
// therefore be recorded, with chat B's numbers, in chat B's ring. Plan 11 builds the cost and
// latency report out of these rings, so a mis-attributed row is not cosmetic.
//
// Owner: plan 03. v2.3 plan 01 §A writes the reproduction; plan 03 flips the row.

import { JudgeRuntime } from "@runtime/judge";
import { choice } from "@judge/index";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "./runToken";
import type { JudgeCallRecord } from "@judge/index";
import { control, finding, must } from "../../test/findings/ledger";
import { testOwnership } from "../../test/findings/testOwnership";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [], extensionSettings: {} }) }));

// A real request: validateJudgeRequest rejects a hand-rolled shape, and a rejected request never
// reaches the transport, so the reproduction would be testing nothing.
const request = {
  state: { scene: "the hall" },
  questions: { location: choice("Where is the party?", { hall: "in the hall", road: "on the road" }) },
};

/**
 * Two chats, each with its own call ring, and a judge whose answer can be held open across a
 * switch — the shape of every late-result defect in this plan.
 */
function harness({ ownership = true }: { ownership?: boolean } = {}) {
  const rings: Record<string, JudgeCallRecord[]> = { "chat-a": [], "chat-b": [] };
  let chatId = "chat-a";
  let boundary = 4;
  let epoch = 1;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });

  const ctx = (): RunContext => ({ chatId, storyId: "s1", storyHash: "h1", sessionEpoch: epoch, windowRevision: 0, lowestMutatedMessageId: null });
  const runtime = new JudgeRuntime({
    getSettings: () => ({ enabled: true, model: "jev-1.13.0", timeoutMs: 5000, uses: { sceneTracker: true }, expansion: { variants: 1, temperature: 0.7, pick: "code" } }) as never,
    // JudgeTransport is a FUNCTION, not an object. Passing an object made every call fall back,
    // so the reproduction was exercising the unavailable path and would have 'passed' for the
    // wrong reason (caught 2026-09-20 by a control asserting the answer survives a discard).
    transport: (async () => {
      await held;
      return { model: "jev-1.13.0", answers: { location: { type: "choice" as const, choice: "hall" } } };
    }) as never,
    status: async () => ({ configured: true, model: "jev-1.13.0" }),
    record: (row: JudgeCallRecord) => { rings[chatId].push(row); },
    context: () => ({ boundary, messageId: boundary * 2 }),
    ownership: ownership ? { mint: () => mintToken(ctx()), check: (token: RunToken) => tokenMatches(ctx(), token) } : testOwnership(),
    now: () => 0,
  } as never);

  return {
    runtime,
    rings,
    release,
    switchChat: () => { chatId = "chat-b"; boundary = 40; epoch += 1; },
    advanceBoundary: (next: number) => { boundary = next; },
  };
}

control("a judge call that stays in its own chat is recorded there", async () => {
  const h = harness();
  const pending = h.runtime.ask("sceneTracker", request);
  h.release();
  await pending;
  expect(h.rings["chat-a"]).toHaveLength(1);
  expect(h.rings["chat-b"]).toHaveLength(0);
  expect(h.rings["chat-a"][0].boundary).toBe(4);
});

finding("C1", async () => {
  const h = harness();
  const pending = h.runtime.ask("sceneTracker", request);
  await Promise.resolve();
  h.switchChat();
  h.release();
  await pending;

  must(
    h.rings["chat-b"].length === 0,
    `a judge call started in one chat was recorded in another chat's ring (${h.rings["chat-b"].length} row(s) landed in chat-b) — plan 11 builds its cost and latency report from these rings`,
  );
  must(
    h.rings["chat-a"].length === 0 || h.rings["chat-a"][0].boundary === 4,
    `the call was stamped with the boundary the runtime reached AFTER the answer arrived (${h.rings["chat-a"][0]?.boundary}), not the one it was asked at (4)`,
  );
});

// --- v2.3 plan 03: the call is stamped with the world it was asked in, and only recorded there. ---

control("a call is stamped with the boundary it was ASKED at, not the one it landed at", async () => {
  // The numbers matter as much as the ring: plan 11 reads latency per boundary out of these rows.
  const h = harness();
  const pending = h.runtime.ask("sceneTracker", request as never);
  await Promise.resolve();
  h.advanceBoundary(11);
  h.release();
  await pending;
  expect(h.rings["chat-a"]).toHaveLength(1);
  expect(h.rings["chat-a"][0].boundary).toBe(4);
  // Both numbers, not just the boundary: a mutation sweep on 2026-09-20 found that stamping the
  // LANDING messageId survived, because only the boundary was pinned.
  expect(h.rings["chat-a"][0].messageId).toBe(8);
});

control("a discarded call still returns its answer to the caller", async () => {
  // Returning null here would look like a judge failure rather than a chat switch, and the caller
  // has its own ownership check at its own write edge.
  const h = harness();
  const pending = h.runtime.ask("sceneTracker", request as never);
  await Promise.resolve();
  h.switchChat();
  h.release();
  const result = await pending;
  expect(result.answers).not.toBeNull();
  // A real chat switch bumps the session epoch (CHAT_CHANGED), and the epoch is reported first
  // because it is the more fundamental change — naming the chat would send a reader looking for a
  // switch that the restart already explains.
  expect(result.discarded).toBe("epoch");
});

control("a call under an ownership that never lapses still records", async () => {
  const h = harness({ ownership: false });
  const pending = h.runtime.ask("sceneTracker", request as never);
  await Promise.resolve();
  h.switchChat();
  h.release();
  await pending;
  expect(h.rings["chat-b"]).toHaveLength(1);
});

describe("V3: the unavailable fallback belongs to the chat it was asked in", () => {
  function unavailable() {
    const rings: Record<string, JudgeCallRecord[]> = { "chat-a": [], "chat-b": [] };
    let chatId = "chat-a";
    let boundary = 4;
    let epoch = 1;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const ctx = (): RunContext => ({ chatId, storyId: "s1", storyHash: "h1", sessionEpoch: epoch, windowRevision: 0, lowestMutatedMessageId: null });
    const runtime = new JudgeRuntime({
      getSettings: () => ({ enabled: true, model: "jev-1.13.0", timeoutMs: 5000, uses: { sceneTracker: true }, expansion: { variants: 1, temperature: 0.7, pick: "code" } }) as never,
      transport: (async () => ({ model: "jev-1.13.0", answers: {} })) as never,
      status: async () => { await held; return { configured: false, model: null }; },
      record: (row: JudgeCallRecord) => { rings[chatId].push(row); },
      context: () => ({ boundary, messageId: boundary * 2 }),
      ownership: { mint: () => mintToken(ctx()), check: (token: RunToken) => tokenMatches(ctx(), token) },
      now: () => 0,
    } as never);
    return { runtime, rings, release, switchChat: () => { chatId = "chat-b"; boundary = 40; epoch += 1; } };
  }

  it("a fallback whose chat moved during the status check is recorded nowhere", async () => {
    const h = unavailable();
    const pending = h.runtime.ask("sceneTracker", request);
    await Promise.resolve();
    h.switchChat();
    h.release();
    expect((await pending).fallback).toBe("unavailable");
    expect(h.rings["chat-b"]).toHaveLength(0);
    expect(h.rings["chat-a"]).toHaveLength(0);
  });

  it("control: a fallback in its own chat is recorded there, stamped with the boundary it was asked at", async () => {
    const h = unavailable();
    const pending = h.runtime.ask("sceneTracker", request);
    h.release();
    await pending;
    expect(h.rings["chat-a"]).toHaveLength(1);
    expect(h.rings["chat-a"][0]).toMatchObject({ fallback: "unavailable", boundary: 4 });
  });
});
