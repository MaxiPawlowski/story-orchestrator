import { GenerationLifecycle, isHostEndedShape, isHostStartedShape, WITHHOLD_CAP_MS, type GenerationIntent } from "./generationLifecycle";
import { callTimeoutMs, MAX_TOKENS_TABLE } from "@extraction/callBudget";

const NON_TURN = new Set(["first_message", "extension"]);
const lifecycle = () => new GenerationLifecycle((type) => typeof type !== "string" || !NON_TURN.has(type));
const kinds = (intents: GenerationIntent[]) => intents.map((intent) => (intent.kind === "closed" ? `closed:${intent.reason}` : intent.kind === "settled" ? `settled:${intent.rendered}` : intent.kind));
const FOREIGN = { source: "guided-generations" };

describe("GenerationLifecycle (v2.4 plan 01 T6)", () => {
  it("loud -> nested quiet with force_chid -> ENDED -> render: the nested end re-applies the drafted block and only the render closes", () => {
    const g = lifecycle();
    expect(g.started(["normal", {}, false], 4)).toEqual([{ kind: "opened", type: "normal", params: {} }]);
    g.drafted(2);
    expect(g.started(["quiet", { quiet_prompt: "think", force_chid: 2 }, false], 5)).toEqual([{ kind: "nested", type: "quiet", params: { quiet_prompt: "think", force_chid: 2 }, withholds: true }]);
    expect(g.started(["quiet", { force_chid: 2 }, false], 5)).toEqual([{ kind: "nested", type: "quiet", params: { force_chid: 2 }, withholds: true }]);
    expect(g.ended([5])).toEqual([]);
    expect(g.ended([5])).toEqual([{ kind: "reapply", chid: 2 }]);
    expect(g.snapshot().outermost).toEqual({ type: "normal", watermark: 4 });
    expect(g.rendered(5, "normal")).toEqual([{ kind: "closed", reason: "rendered" }, { kind: "settled", rendered: true, messageId: 5 }]);
    expect(g.snapshot()).toEqual({ outermost: null, nested: [], awaitingRender: null, draftedChid: null, openedCount: 1 });
  });

  it("ignores a foreign {source} STARTED, ENDED and STOPPED, alone and inside an open generation", () => {
    const g = lifecycle();
    expect(g.started([FOREIGN], 3)).toEqual([]);
    expect(g.ended([FOREIGN])).toEqual([]);
    expect(g.stopped([FOREIGN])).toEqual([]);
    expect(g.snapshot().outermost).toBeNull();
    g.started(["normal", {}, false], 3);
    expect(g.started([FOREIGN], 3)).toEqual([]);
    expect(g.ended([FOREIGN])).toEqual([]);
    expect(g.stopped([FOREIGN])).toEqual([]);
    expect(g.snapshot()).toMatchObject({ outermost: { type: "normal" }, nested: [] });
    expect(isHostStartedShape([FOREIGN])).toBe(false);
    expect(isHostEndedShape([FOREIGN])).toBe(false);
  });

  it("ignores an unpaired dry run, so the next real generation is still the outermost", () => {
    const g = lifecycle();
    expect(g.started(["normal", {}, true], 3)).toEqual([]);
    expect(g.snapshot().outermost).toBeNull();
    expect(kinds(g.started(["normal", {}, false], 3))).toEqual(["opened"]);
    expect(g.started(["normal", {}, true], 4)).toEqual([]);
    expect(g.snapshot().nested).toEqual([]);
  });

  it("STOPPED closes without a reply, and a stop's ENDED-then-STOPPED order never spends the note on the partial render", () => {
    const g = lifecycle();
    g.started(["normal", {}, false], 3);
    expect(g.stopped([])).toEqual([{ kind: "closed", reason: "stopped" }, { kind: "settled", rendered: false }]);
    g.started(["normal", {}, false], 3);
    expect(kinds(g.ended([4]))).toEqual(["closed:ended"]);
    expect(g.stopped([])).toEqual([{ kind: "settled", rendered: false }]);
    expect(g.rendered(4, "normal")).toEqual([]);
    expect(g.stopped([])).toEqual([]);
  });

  it("accepts Stepped Thinking's Generate(null, {force_chid}) as a host generation", () => {
    const g = lifecycle();
    expect(g.started([null, { force_chid: 1 }], 6)).toEqual([{ kind: "opened", type: null, params: { force_chid: 1 } }]);
    expect(isHostStartedShape([undefined])).toBe(true);
    expect(isHostStartedShape(["normal", null])).toBe(false);
    expect(isHostStartedShape(["normal", {}, "yes"])).toBe(false);
  });

  it("a two-member group turn: the wrapper's STARTED is outermost, each member's own render closes its generation", () => {
    const g = lifecycle();
    expect(kinds(g.started(["normal", {}, false], 4))).toEqual(["opened"]);
    g.drafted(1);
    expect(g.started(["normal", {}, false], 5)).toEqual([{ kind: "nested", type: "normal", params: {}, withholds: false }]);
    expect(kinds(g.rendered(5, "normal"))).toEqual(["closed:rendered", "settled:true"]);
    expect(kinds(g.rendered(5, "normal"))).toEqual([]);
    expect(g.ended([6])).toEqual([]);
    g.drafted([2]);
    expect(g.snapshot().draftedChid).toBe(2);
    expect(kinds(g.started(["normal", {}, false], 6))).toEqual(["opened"]);
    expect(kinds(g.ended([7]))).toEqual(["closed:ended"]);
    expect(g.rendered(6, "first_message")).toEqual([]);
    expect(g.rendered(6, "normal")).toEqual([{ kind: "settled", rendered: true, messageId: 6 }]);
    expect(g.rendered(6, "normal")).toEqual([]);
  });

  it("impersonate withholds the private block while open and closes on its ENDED with no reply to wait for", () => {
    const g = lifecycle();
    expect(g.started(["impersonate", {}, false], 3)).toEqual([{ kind: "opened", type: "impersonate", params: {} }]);
    expect(g.ended([3])).toEqual([{ kind: "closed", reason: "ended" }, { kind: "settled", rendered: false }]);
    expect(g.snapshot().awaitingRender).toBeNull();
    g.started(["normal", {}, false], 3);
    expect(g.started(["impersonate", {}, false], 3)).toEqual([{ kind: "nested", type: "impersonate", params: {}, withholds: true }]);
  });

  it("a group quiet (the wrapper's STARTED, the member's STARTED, ONE ENDED) closes when the wrapper finishes, so the next loud run opens", () => {
    for (const type of ["quiet", "impersonate"]) {
      const g = lifecycle();
      expect(kinds(g.started([type, { quiet_prompt: "sum" }, false], 20))).toEqual(["opened"]);
      g.drafted(3);
      expect(kinds(g.started([type, { quiet_prompt: "sum" }, false], 20))).toEqual(["nested"]);
      expect(g.ended([20])).toEqual([]);
      expect(kinds(g.wrapperFinished())).toEqual(["closed:ended", "settled:false"]);
      expect(g.snapshot()).toMatchObject({ outermost: null, nested: [], draftedChid: null });
      expect(kinds(g.started([undefined, {}, false], 21))).toEqual(["opened"]);
    }
  });

  it("control: a wrapper finishing leaves a loud outermost waiting for its render, and does nothing when nothing is open", () => {
    const g = lifecycle();
    expect(g.wrapperFinished()).toEqual([]);
    g.started(["normal", {}, false], 4);
    expect(g.wrapperFinished()).toEqual([]);
    expect(g.snapshot().outermost).toEqual({ type: "normal", watermark: 4 });
  });

  it("swipe, continue and regenerate close on the message they rewrite", () => {
    for (const type of ["swipe", "continue", "regenerate"]) {
      const g = lifecycle();
      g.started([type, {}, false], 5);
      expect(kinds(g.rendered(4, type))).toEqual(["closed:rendered", "settled:true"]);
    }
  });

  it("a chat change closes everything without spending the note and forgets the drafted member", () => {
    const g = lifecycle();
    g.started(["normal", {}, false], 3);
    g.drafted(1);
    g.started(["quiet", {}, false], 3);
    expect(g.chatChanged()).toEqual([{ kind: "closed", reason: "chat-changed" }, { kind: "settled", rendered: false }]);
    expect(g.snapshot()).toEqual({ outermost: null, nested: [], awaitingRender: null, draftedChid: null, openedCount: 1 });
  });

  it("a new outermost drops a close still waiting for its render", () => {
    const g = lifecycle();
    g.started(["normal", {}, false], 3);
    g.ended([4]);
    expect(kinds(g.started(["normal", {}, false], 4))).toEqual(["settled:false", "opened"]);
    expect(g.rendered(3, "normal")).toEqual([]);
  });

  it("v2.5 plan 02 C1: counts each outermost it opens, never a nested, dry-run or foreign one", () => {
    const g = lifecycle();
    g.started(["normal", {}, false], 4);
    g.started(["quiet", {}, false], 5);
    g.started(["normal", {}, true], 5);
    g.started([FOREIGN], 5);
    expect(g.snapshot().openedCount).toBe(1);
    g.chatChanged();
    expect(g.snapshot().openedCount).toBe(1);
    g.started(["normal", {}, false], 0);
    expect(g.snapshot().openedCount).toBe(2);
  });
});

describe("v2.8 69 K9: a withholding run that never ended is closed by the next run that is not it", () => {
  it("a quiet run returns before sending (no ENDED), then a loud run starts: the quiet hold closes and the loud run opens", () => {
    for (const type of ["quiet", "impersonate"]) {
      const g = lifecycle();
      expect(kinds(g.started([type, {}, false], 3, 1000))).toEqual(["opened"]);
      expect(kinds(g.started(["normal", {}, false], 3, 1200))).toEqual(["closed:ended", "settled:false", "opened"]);
      expect(g.snapshot().outermost).toEqual({ type: "normal", watermark: 3 });
      expect(g.snapshot().nested).toEqual([]);
    }
  });

  it("our own generate interceptor entry of a loud run closes a stale withholding run; the carrying run's own entry does not", () => {
    const g = lifecycle();
    g.started(["quiet", {}, false], 3, 1000);
    expect(g.intercepted("quiet", 1100)).toEqual([]);
    expect(kinds(g.intercepted("normal", 1200))).toEqual(["closed:ended", "settled:false"]);
    expect(g.snapshot().outermost).toBeNull();
    expect(g.intercepted("normal", 1300)).toEqual([]);
  });

  it("a legitimate nested quiet keeps its carry: inside a loud run, and a group quiet's member start inside its wrapper", () => {
    const loud = lifecycle();
    loud.started(["normal", {}, false], 4, 1000);
    expect(loud.started(["quiet", {}, false], 4, 1000 + 2 * WITHHOLD_CAP_MS)).toEqual([{ kind: "nested", type: "quiet", params: {}, withholds: true }]);
    expect(loud.expire(1000 + 3 * WITHHOLD_CAP_MS)).toEqual([]);
    expect(loud.intercepted("quiet", 1000)).toEqual([]);
    const group = lifecycle();
    group.started(["quiet", { quiet_prompt: "sum" }, false], 20, 1000);
    expect(kinds(group.started(["quiet", { quiet_prompt: "sum" }, false], 20, 1500))).toEqual(["nested"]);
  });

  it("a withholding run still open after the cap is closed by the timer, and only then", () => {
    const g = lifecycle();
    g.started(["impersonate", {}, false], 3, 1000);
    expect(g.expire(1000 + WITHHOLD_CAP_MS - 1)).toEqual([]);
    expect(kinds(g.expire(1000 + WITHHOLD_CAP_MS))).toEqual(["closed:ended", "settled:false"]);
    expect(g.expire(1000 + 2 * WITHHOLD_CAP_MS)).toEqual([]);
    const nested = lifecycle();
    nested.started(["quiet", {}, false], 3, 1000);
    expect(kinds(nested.started(["quiet", {}, false], 3, 1000 + WITHHOLD_CAP_MS))).toEqual(["closed:ended", "settled:false", "opened"]);
  });

  it("the cap is the longest single model call our own timeouts allow: the largest answer at a 32,768-token context", () => {
    const largest = Math.max(...Object.values(MAX_TOKENS_TABLE).map((budget) => ("fixed" in budget ? budget.fixed : budget.cap)));
    expect(WITHHOLD_CAP_MS).toBe(callTimeoutMs(largest, 32768));
    expect(WITHHOLD_CAP_MS).toBe(300336);
  });
});
