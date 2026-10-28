import { replyVia, type ModelTransport } from "@extraction/reply";
import { createModelCallVia } from "./modelCallCore";
import { PREFIX_DRIFT_KEYS, PrefixDrift, type PrefixDriftRecord } from "./prefixDrift";
import { prefixDrift, replyKey, requestPromptText } from "./prefixDriftPort";

const turn = (role: string, text: string) => `<|turn>${role}\n${text}<turn|>\n`;
const LINES = Array.from({ length: 10 }, (_, index) => `line ${index} of the scripted scene`);
const prompt = (n: number, head = "Card: a careful scout.") => {
  const turns = LINES.slice(0, n).map((text, index) => turn(index % 2 ? "model" : "user", text));
  turns.splice(turns.length - 2, 0, turn("system", `Guidance at turn ${n}.`));
  return `${turn("system", head)}${turns.join("")}<|turn>model\n`;
};

describe("PrefixDrift", () => {
  it("records the first divergence per key, warns once per churning reply key, and keeps side passes silent", () => {
    const breaks: Array<[string, boolean]> = [];
    const drift = new PrefixDrift((record, first) => breaks.push([record.key, first]), () => 0);
    expect(drift.observe("reply:c:Arin", "reply", prompt(4))).toBeNull();
    expect(drift.observe("reply:c:Arin", "reply", prompt(6))?.verdict).toBe("ok");
    expect(drift.observe("reply:c:DM", "reply", prompt(4, "Card: 3:04 PM"))).toBeNull();
    const churn = drift.observe("reply:c:DM", "reply", prompt(6, "Card: 3:05 PM")) as PrefixDriftRecord;
    expect(churn).toMatchObject({ verdict: "above-boundary", source: "cut-marker", at: "1970-01-01T00:00:00.000Z" });
    expect(churn.lost).toBeGreaterThan(0);
    drift.observe("reply:c:DM", "reply", prompt(8, "Card: 3:06 PM"));
    drift.observe("side:c:read", "side", "plain one");
    expect(drift.observe("side:c:read", "side", "plain two")?.verdict).toBe("no-boundary");
    expect(breaks).toEqual([["reply:c:DM", true], ["reply:c:DM", false]]);
    expect(drift.summary()).toEqual([
      { key: "reply:c:Arin", kind: "reply", pairs: 1, aboveBoundary: 0, noBoundary: 0, worstLost: 0, last: "ok" },
      expect.objectContaining({ key: "reply:c:DM", pairs: 2, aboveBoundary: 2, last: "above-boundary" }),
      { key: "side:c:read", kind: "side", pairs: 1, aboveBoundary: 0, noBoundary: 1, worstLost: 0, last: "no-boundary" },
    ]);
    expect(drift.records().every((record) => !("prompt" in record))).toBe(true);
    drift.clear();
    expect(drift.records()).toEqual([]);
    expect(drift.observe("reply:c:Arin", "reply", prompt(8))).toBeNull();
  });

  it("forgets the least recently used key past the key cap", () => {
    const drift = new PrefixDrift();
    for (let index = 0; index <= PREFIX_DRIFT_KEYS; index += 1) drift.observe(`k${index}`, "reply", prompt(4));
    expect(drift.observe("k0", "reply", prompt(4))).toBeNull();
    expect(drift.observe(`k${PREFIX_DRIFT_KEYS}`, "reply", prompt(4))?.verdict).toBe("identical");
  });
});

describe("prefixDrift port", () => {
  afterEach(() => prefixDrift.reset());

  it("keys a reply by chat, drafted member and withholding lane", () => {
    expect(replyKey("c1", "Arin", "normal")).toBe("reply:c1:Arin");
    expect(replyKey(null, null, "quiet")).toBe("reply:none:resting:quiet");
    expect(replyKey("c1", "Arin", "impersonate")).toBe("reply:c1:Arin:impersonate");
  });

  it("reads a text prompt or renders chat messages", () => {
    expect(requestPromptText({ prompt: "p" })).toBe("p");
    expect(requestPromptText({ messages: [{ role: "system", content: "a" }, { role: "user", content: "b" }] })).toBe("### system\na\n### user\nb");
    expect(requestPromptText({})).toBeNull();
  });

  it("loads the recorder lazily and exposes it through the debug handle", async () => {
    expect(await prefixDrift.observe("reply:c:Arin", "reply", prompt(4))).toBeNull();
    expect((await prefixDrift.observe("reply:c:Arin", "reply", prompt(6)))?.verdict).toBe("ok");
    expect(await prefixDrift.observe("reply:c:Arin", "reply", "")).toBeNull();
    const handle = prefixDrift.handle();
    expect(handle.records()).toHaveLength(1);
    handle.clear();
    expect(handle.summary()).toEqual([]);
  });

  it("a model call reports its prompt, role and chat before the transport runs, and a planted answer reports nothing", async () => {
    const seen: string[] = [];
    const transport: ModelTransport = async () => {
      seen.push("transport");
      return { ok: true, text: "NO_DELTA", finish: "stop", meter: { effort: "default", applied: false, collapsed: false, unsupported: null, budget: 0, chars: 0, tokens: null } };
    };
    const call = createModelCallVia(replyVia(transport), {
      settings: () => ({ profileId: "p" }) as never,
      exists: () => true,
      planted: false,
      stamp: () => ({ chatId: "c9", messageId: 3 }),
      prompted: (role, text, chatId) => seen.push(`${role}|${text}|${chatId}`),
    });
    await call("the prompt", { role: "read", pass: "read" });
    await call("planted", { role: "read", pass: "read", debugResponse: "NO_DELTA" });
    expect(seen).toEqual(["read|the prompt|c9", "transport"]);
  });
});
