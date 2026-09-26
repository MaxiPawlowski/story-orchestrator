jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  setStoryExtensionPrompt: () => {},
  clearStoryExtensionPrompt: () => {},
}));

import { defaultJudgeSettings, type JudgeRequest, type JudgeSettings } from "@judge/index";
import type { ConflictPair, LedgerView, MemoryEntry } from "@memory/index";
import { provenance } from "@memory/provenance";
import { createWardenCheck, establishedFacts } from "./continuity";
import { JudgeRuntime } from "./judge";
import { testOwnership } from "../../test/findings/testOwnership";

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
    expect(establishedFacts(entries, ledger).map((row) => row.text)).toEqual(["Mira hp = 3", "Arin swore an oath.", "Mira holds the key.", "The bridge fell."]);
  });

  // v2.3 plan 05: the warden's fact list travels as RECORDS, so the card the author reviews can say
  // where a claim came from instead of asserting a sentence with no owner.
  it("carries each fact's own id and provenance, and names a store that disagrees", () => {
    const entries = [fact("b", "Mira holds the key.", { importance: 3, messageId: 4, provenance: provenance({ source: "extractor", messageId: 4, boundary: 2, pass: "shared-read" }) })];
    const bound = { "Mira|hp": provenance({ source: "blackboard", messageId: -1, boundary: 0, pass: "blackboard", inputs: [{ store: "blackboard", id: "miraHp" }] }) };
    const conflicts = [{ key: "bound:mira|hp", detectedAt: "t", window: null, sides: [{ store: "ledger", id: "bound:Mira:hp", label: "Mira hp = 5 (blackboard)" }, { store: "memory", id: "b", label: "Mira holds the key." }] }] as ConflictPair[];
    const facts = establishedFacts(entries, [{ entity: "Mira", field: "hp", value: "3", bound: true, turn: 1 }] as LedgerView[], bound, conflicts);
    expect(facts.map((row) => row.id)).toEqual(["bound:Mira:hp", "b"]);
    expect(facts[0].provenance?.source).toBe("blackboard");
    expect(facts[1].provenance).toMatchObject({ source: "extractor", messageId: 4, pass: "shared-read" });
    expect(facts[1].conflictingValue).toBe("Mira hp = 5 (blackboard)");
  });
});

describe("continuity check (v2.2 plan 05)", () => {
  const setup = (options: { enabled?: boolean; p?: number[] } = {}) => {
    const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: options.enabled ?? true };
    const requests: JudgeRequest[] = [];
    const judge = new JudgeRuntime({ ownership: testOwnership(),
      getSettings: () => settings,
      transport: async (request) => {
        requests.push(request);
        return { model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(request.questions).map((id, index) => [id, { type: "noul" as const, noul: options.p?.[index] ?? 0.05 }])) };
      },
      status: async () => ({ configured: true }),
      record: () => undefined,
      context: () => ({ boundary: 1, messageId: 4 }),
    });
    const warden = createWardenCheck(() => judge);
    return { check: async (reply: { speaker: string; text: string }, facts: string[]) => (await warden({ reply, facts, agency: null, houseRules: [] }))?.find((finding) => finding.family === "continuity") ?? null, requests };
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
