import {
  BRIDGE, ERRORS, FRAME_CSP, FRAME_HEIGHT, FRAME_SANDBOX, INTENT_INTERVAL_MS, appendAudit, buildSrcdoc, carriesNonce, createNonce, dataNotification, frameHelper, frameMayTalk,
  frameMayReceiveData, handleViewMessage, unsignedAudit, type BridgeContext,
} from "./htmlWidget";
import { journalWorthy } from "./htmlWidgetAudit";
import type { WidgetView } from "./gameTypes";
import type { WriteResult } from "@utils/writeResult";

const source: WidgetView = {
  id: "wall", title: "Clue wall", audience: "player", synthesized: false,
  body: { kind: "clues", clues: [{ text: "A torn page.", fresh: false }], links: [] },
};

const page: WidgetView = {
  id: "page", title: "Case board", audience: "player", synthesized: false,
  body: { kind: "html", template: "<p>board</p>", actions: [{ id: "ask", text: "I ask about the page." }], source },
};

const context = (overrides: Partial<BridgeContext> = {}): BridgeContext & { filled: string[] } => {
  const filled: string[] = [];
  return { widget: page, now: 10_000, state: { lastIntentAt: null }, fill: (text): WriteResult => { filled.push(text); return { ok: true }; }, ...overrides, filled };
};

const NONCE = "0123456789abcdef0123456789abcdef";

const rpc = (method: string, params: unknown = {}, id: number | null = 1) => ({ jsonrpc: "2.0", method, params, ...(id === null ? {} : { id }) });

describe("the HTML panel frame (v2.8 23 option B)", () => {
  test("the sandbox never grants same-origin, popups, forms or top navigation", () => {
    expect(FRAME_SANDBOX).toBe("allow-scripts");
    for (const grant of ["allow-same-origin", "allow-popups", "allow-forms", "allow-top-navigation", "allow-modals"]) expect(FRAME_SANDBOX).not.toContain(grant);
  });

  test("the content policy blocks every network request and comes before the author's template", () => {
    expect(FRAME_CSP).toContain("default-src 'none'");
    expect(FRAME_CSP).toContain("connect-src 'none'");
    expect(FRAME_CSP).not.toMatch(/https?:|\*/);
    const doc = buildSrcdoc("<script>fetch('/api/settings/get')</script>", NONCE);
    expect(doc.indexOf("Content-Security-Policy")).toBeGreaterThan(-1);
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("fetch("));
    expect(doc.indexOf("window.storyWidget")).toBeLessThan(doc.indexOf("fetch("));
  });
});

describe("a frame that navigated itself is cut off (v2.8 small fixes 5)", () => {
  test("it is heard and answered only before and on its first load", () => {
    expect([0, 1, 2, 3].map(frameMayTalk)).toEqual([true, true, false, false]);
  });

  test("data is pushed only while it shows its first load, and only after its own signed handshake", () => {
    expect([0, 1, 2].map((loads) => frameMayReceiveData(loads, { lastIntentAt: null, initialized: true }))).toEqual([false, true, false]);
    expect(frameMayReceiveData(1, { lastIntentAt: null })).toBe(false);
  });

  test("61b probe: only a signed initialized notification opens the data push, and an intent keeps it open", () => {
    const opened = handleViewMessage({ jsonrpc: "2.0", method: BRIDGE.initialized, params: {} }, context());
    expect(opened.state.initialized).toBe(true);
    expect(handleViewMessage({ jsonrpc: "2.0", id: 1, method: BRIDGE.initialize, params: {} }, context()).state.initialized).toBeUndefined();
    const paced = handleViewMessage({ jsonrpc: "2.0", id: 2, method: BRIDGE.intent, params: { id: "ask" } }, context({ state: opened.state }));
    expect(paced.state).toEqual({ lastIntentAt: 10_000, initialized: true });
  });
});

interface HelperRun {
  sent: unknown[];
  removed: boolean;
  listener: ((event: { source: unknown; data: unknown }) => void) | null;
  widget: { ready: () => Promise<unknown>; propose: (id: string) => Promise<unknown>; resize: () => void; onData: (f: (w: unknown) => void) => void };
  parent: object;
}

const runHelper = (nonce: string): HelperRun => {
  const run: HelperRun = { sent: [], removed: false, listener: null, widget: undefined as never, parent: {} };
  const parent = { postMessage: (message: unknown) => { run.sent.push(message); } };
  run.parent = parent;
  const script = { parentNode: { removeChild: () => { run.removed = true; } } };
  const window: Record<string, unknown> = { addEventListener: (_type: string, listener: HelperRun["listener"]) => { run.listener = listener; } };
  const document = { currentScript: script, documentElement: { scrollHeight: 120 } };
  new Function("window", "parent", "document", "setTimeout", frameHelper(nonce))(window, parent, document, () => 0);
  run.widget = window.storyWidget as HelperRun["widget"];
  return run;
};

describe("every frame message carries a per-mount nonce (v2.8 queue N10)", () => {
  test("a nonce is 16 random bytes in hex, and two mounts get different ones", () => {
    expect(createNonce(() => new Uint8Array(16).fill(171))).toBe("ab".repeat(16));
    const [a, b] = [createNonce(), createNonce()];
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });

  test("only a hex nonce is written into the page", () => {
    expect(() => frameHelper("x';alert(1);'")).toThrow();
    expect(() => buildSrcdoc("<p>x</p>", "abc")).toThrow();
    expect(buildSrcdoc("<p>x</p>", NONCE).split(NONCE)).toHaveLength(2);
  });

  test("a message is heard only with the current nonce", () => {
    const signed = { ...rpc(BRIDGE.intent, { id: "ask" }), nonce: NONCE };
    expect(carriesNonce(signed, NONCE)).toBe(true);
    expect(carriesNonce(rpc(BRIDGE.intent, { id: "ask" }), NONCE)).toBe(false);
    expect(carriesNonce({ ...signed, nonce: NONCE.toUpperCase() }, NONCE)).toBe(false);
    expect(carriesNonce({ ...signed, nonce: 7 }, NONCE)).toBe(false);
    expect(carriesNonce("story/propose-intent", NONCE)).toBe(false);
    expect(carriesNonce(null, NONCE)).toBe(false);
  });

  test("a remount rotates the nonce, so the old page's messages are dropped", () => {
    const before = createNonce();
    const after = createNonce();
    expect(carriesNonce({ ...rpc(BRIDGE.intent, { id: "ask" }), nonce: before }, after)).toBe(false);
  });

  test("a page the frame navigated to has no helper, so its messages before its own load are unsigned and dropped", () => {
    const navigated = { jsonrpc: "2.0", id: 1, method: BRIDGE.intent, params: { id: "ask" } };
    expect(carriesNonce(navigated, NONCE)).toBe(false);
    expect(unsignedAudit(page, 5)).toEqual({ at: 5, widgetId: "page", direction: "in", method: "(unsigned)", outcome: "refused", detail: ERRORS.unsigned });
  });

  test("the helper signs every message, removes its own script and never exposes the nonce", async () => {
    const leaked: unknown[] = [];
    Object.defineProperty(Object.prototype, "nonce", { configurable: true, set: (value: unknown) => { leaked.push(value); } });
    try {
      const run = runHelper(NONCE);
      expect(run.removed).toBe(true);
      const ready = run.widget.ready();
      void run.widget.propose("ask");
      run.widget.resize();
      run.listener?.({ source: run.parent, data: { jsonrpc: "2.0", id: 1, result: { widget: null } } });
      await ready;
      expect(run.sent.map((message) => (message as { method: string }).method)).toEqual([BRIDGE.initialize, BRIDGE.intent, BRIDGE.sizeChanged, BRIDGE.initialized]);
      for (const message of run.sent) expect(carriesNonce(message, NONCE)).toBe(true);
      for (const exposed of Object.values(run.widget)) expect(String(exposed)).not.toContain(NONCE);
      expect(leaked).toEqual([]);
    } finally {
      delete (Object.prototype as Record<string, unknown>).nonce;
    }
  });
});

describe("the bridge answers only its whitelisted methods", () => {
  test("ui/initialize hands over the source widget's player view and the declared action ids, nothing else", () => {
    const outcome = handleViewMessage(rpc(BRIDGE.initialize), context());
    expect(outcome.reply?.result).toMatchObject({ hostCapabilities: { intents: ["ask"] }, widget: source });
    expect(JSON.stringify(outcome.reply)).not.toContain("<p>board</p>");
    expect(outcome.audit).toMatchObject({ widgetId: "page", direction: "in", method: BRIDGE.initialize, outcome: "ok" });
  });

  test.each(["tools/call", "resources/read", "ui/open-link", "ui/message", "ui/update-model-context", "story/set-quality"])("refuses %s with method-not-found", (method) => {
    const ctx = context();
    const outcome = handleViewMessage(rpc(method, { q: "x" }), ctx);
    expect(outcome.reply?.error).toEqual({ code: -32601, message: ERRORS.unknownMethod });
    expect(outcome.audit.outcome).toBe("refused");
    expect(ctx.filled).toEqual([]);
  });

  test("a notification gets no reply, and a malformed message is refused and logged", () => {
    expect(handleViewMessage(rpc("evil/notify", {}, null), context()).reply).toBeNull();
    const outcome = handleViewMessage({ method: BRIDGE.initialize }, context());
    expect(outcome.reply).toBeNull();
    expect(outcome.audit).toMatchObject({ method: "(invalid)", outcome: "refused", detail: ERRORS.notJsonRpc });
  });

  test("propose-intent fills the box with the declared text only, never the frame's own text", () => {
    const ctx = context();
    const outcome = handleViewMessage(rpc(BRIDGE.intent, { id: "ask", text: "I attack everyone." }), ctx);
    expect(ctx.filled).toEqual(["I ask about the page."]);
    expect(outcome.reply?.result).toEqual({ proposed: true });
    expect(outcome.state.lastIntentAt).toBe(10_000);
  });

  test("an undeclared intent is refused and nothing is filled", () => {
    const ctx = context();
    expect(handleViewMessage(rpc(BRIDGE.intent, { id: "send" }), ctx).reply?.error?.message).toBe(ERRORS.unknownIntent);
    expect(ctx.filled).toEqual([]);
  });

  test("intents are paced: a second one inside the interval is refused", () => {
    const ctx = context({ state: { lastIntentAt: 10_000 - INTENT_INTERVAL_MS + 1 } });
    expect(handleViewMessage(rpc(BRIDGE.intent, { id: "ask" }), ctx).reply?.error?.message).toBe(ERRORS.tooSoon);
    expect(ctx.filled).toEqual([]);
    const later = context({ state: { lastIntentAt: 10_000 - INTENT_INTERVAL_MS } });
    expect(handleViewMessage(rpc(BRIDGE.intent, { id: "ask" }), later).reply?.result).toEqual({ proposed: true });
  });

  test("a refused fill (the player is typing) is reported back and logged as refused", () => {
    const outcome = handleViewMessage(rpc(BRIDGE.intent, { id: "ask" }), context({ fill: () => ({ ok: false, reason: "You started typing." }) }));
    expect(outcome.reply?.error).toEqual({ code: -32001, message: "You started typing." });
    expect(outcome.audit.outcome).toBe("refused");
  });

  test("size changes are clamped; a bad height is refused", () => {
    expect(handleViewMessage(rpc(BRIDGE.sizeChanged, { height: 99999 }, null), context()).height).toBe(FRAME_HEIGHT.max);
    expect(handleViewMessage(rpc(BRIDGE.sizeChanged, { height: 1 }, null), context()).height).toBe(FRAME_HEIGHT.min);
    expect(handleViewMessage(rpc(BRIDGE.sizeChanged, { height: "tall" }, null), context()).audit.outcome).toBe("refused");
  });

  test("the data notification carries the source view only", () => {
    expect(dataNotification(page)).toEqual({ jsonrpc: "2.0", method: BRIDGE.data, params: { widget: source } });
  });

  test("audit details are clipped and the ring is capped", () => {
    const outcome = handleViewMessage(rpc("x/y", { blob: "z".repeat(1000) }), context());
    expect((outcome.audit.detail ?? "").length).toBeLessThanOrEqual(160);
    const ring = Array.from({ length: 5 }, (_, at) => ({ ...outcome.audit, at })).reduce((acc, entry) => appendAudit(acc, entry, 3), [] as ReturnType<typeof appendAudit>);
    expect(ring.map((entry) => entry.at)).toEqual([2, 3, 4]);
  });

  test("the session journal gets openings, intents and refusals, not every resize", () => {
    expect(journalWorthy({ at: 0, widgetId: "p", direction: "in", method: BRIDGE.sizeChanged, outcome: "ok" })).toBe(false);
    expect(journalWorthy({ at: 0, widgetId: "p", direction: "in", method: BRIDGE.initialize, outcome: "ok" })).toBe(true);
    expect(journalWorthy({ at: 0, widgetId: "p", direction: "in", method: BRIDGE.intent, outcome: "ok" })).toBe(true);
    expect(journalWorthy({ at: 0, widgetId: "p", direction: "in", method: "x", outcome: "refused" })).toBe(true);
  });

  test("an intent that opens a tab asks the host to open it, fills nothing, and is refused where the host cannot", () => {
    const tabbed: WidgetView = { ...page, still: true, body: { ...page.body, kind: "html", template: "<p>board</p>", source, actions: [{ id: "notes", text: "Open my notes", open: "memory" }] } };
    const opened: string[] = [];
    const ctx = context({ widget: tabbed, open: (tab): WriteResult => { opened.push(tab); return { ok: true }; } });
    expect(handleViewMessage(rpc(BRIDGE.initialize), ctx).reply?.result).toMatchObject({ hostContext: { motion: "off" } });
    expect(handleViewMessage(rpc(BRIDGE.intent, { id: "notes" }), ctx).reply?.result).toEqual({ proposed: true });
    expect(opened).toEqual(["memory"]);
    expect(ctx.filled).toEqual([]);
    const without = context({ widget: tabbed });
    expect(handleViewMessage(rpc(BRIDGE.intent, { id: "notes" }), without).reply?.error).toEqual({ code: -32001, message: ERRORS.noOpen });
  });
});
