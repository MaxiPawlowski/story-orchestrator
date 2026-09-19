import { defaultJudgeSettings, type JudgeRequest, type JudgeSettings } from "@judge/index";
import type { LedgerView, MemoryEntry } from "@memory/index";
import { createContinuityCheck, establishedFacts } from "./continuity";
import { JudgeRuntime } from "./judge";

const fact = (id: string, text: string, patch: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id, tier: "facts", text, type: "event", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "", createdAt: 1, recallCount: 0, ...patch,
} as MemoryEntry);

describe("established facts (v2.2 plan 05)", () => {
  it("puts bound ledger rows first, then live facts with pinned ones leading, and skips dead ones", () => {
    const entries = [
      fact("a", "The bridge fell.", { importance: 1, createdAt: 5 }),
      fact("b", "Mira holds the key.", { importance: 3 }),
      fact("c", "The gate is open.", { supersededBy: "d" }),
      fact("d", "The ferryman is dead.", { contradicted: true }),
      fact("e", "Arin swore an oath.", { tier: "session_details", pinned: true }),
      fact("f", "The rain stopped.", { tier: "short_term" }),
    ];
    const ledger = [{ entity: "Mira", field: "hp", value: "3", bound: true, turn: 1 }, { entity: "Arin", field: "mood", value: "grim", bound: false, turn: 1 }] as LedgerView[];
    expect(establishedFacts(entries, ledger)).toEqual(["Mira hp = 3", "Arin swore an oath.", "Mira holds the key.", "The bridge fell."]);
  });
});

describe("continuity check (v2.2 plan 05)", () => {
  const setup = (options: { enabled?: boolean; p?: number[] } = {}) => {
    const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: options.enabled ?? true };
    const requests: JudgeRequest[] = [];
    const judge = new JudgeRuntime({
      getSettings: () => settings,
      transport: async (request) => {
        requests.push(request);
        return { model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(request.questions).map((id, index) => [id, { type: "noul" as const, noul: options.p?.[index] ?? 0.05 }])) };
      },
      status: async () => ({ configured: true }),
      record: () => undefined,
      context: () => ({ boundary: 1, messageId: 4 }),
    });
    return { check: createContinuityCheck(() => judge), requests };
  };
  const reply = { speaker: "Mira", text: "I crossed the bridge this morning." };

  it("asks nothing with the judge off or no facts", async () => {
    for (const [options, facts] of [[{ enabled: false }, ["The bridge fell."]], [{}, []]] as const) {
      const env = setup(options);
      expect(await env.check(reply, [...facts])).toBeNull();
      expect(env.requests).toHaveLength(0);
    }
  });

  it("names only the facts over the cut, verbatim, in a code-composed note", async () => {
    const env = setup({ p: [0.92, 0.2, 0.75] });
    const note = await env.check(reply, ["The bridge fell.", "Mira holds the key.", "The river is frozen."]);
    expect(note?.facts).toEqual(["The bridge fell.", "The river is frozen."]);
    expect(note?.text).toContain("established — The bridge fell.");
    expect(env.requests[0].state).toMatchObject({ reply });
  });
});
