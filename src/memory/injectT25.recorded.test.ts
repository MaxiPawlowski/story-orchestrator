import * as recorded from "../../test/fixtures/t2-5-memory.rows.json";
import { buildMemoryInjection, type InjectionOptions } from "./inject";
import type { MemoryEntry, MemoryTier } from "./types";

const rows = recorded.entries as unknown as MemoryEntry[];
const edited = rows.find((entry) => entry.id === recorded.edited[0])!;
const TURN = "Natalia, have you ever actually met Baroness Serenola? What did you make of her?";
const options = (facts = 800, turnText = TURN): InjectionOptions => ({
  tokenBudgets: { facts, session_details: 600, short_term: 300, scene_history: 500 } as Record<MemoryTier, number>,
  scoreContext: { boundary: 91, lastMessageId: 148, turnText, turnEntities: [] },
});
const TIGHT = 60;
const injected = (blocks: Record<MemoryTier, string>, pattern: RegExp) =>
  [...blocks.facts.split("\n"), ...blocks.session_details.split("\n")].filter((line) => pattern.test(line)).length;
const BELLE = /Belle.*(crew|Garreth)|(crew|Garreth).*Belle/;
const RIYO = /Riyo.*arms?\b|arms?\b.*Riyo/;

describe("T2-5: the author's edit is used (msg 145 row, edited at boundary 91)", () => {
  it("an edited row is injected ahead of extracted rows, even when the facts budget is tight", () => {
    expect(edited.provenance?.override?.from).toBe("edit");
    const tight = buildMemoryInjection(rows, null, options(TIGHT, ""));
    expect(tight.fates[edited.id]).toBe("injected");
    expect(tight.blocks.facts).toContain(edited.text);
  });

  it("control: the same row as the extractor wrote it loses the tight budget to extracted rows", () => {
    const plain = rows.map((entry) => (entry.id === edited.id ? { ...entry, provenance: { ...entry.provenance!, source: "extractor" as const, override: undefined } } : entry)) as MemoryEntry[];
    expect(buildMemoryInjection(plain, null, options(TIGHT, "")).fates[edited.id]).toBe("over-budget");
  });
});

describe("T2-5: one event, one line across [Established facts] and [Details from this session] (Belle x11, Riyo x7)", () => {
  it("a session detail that restates an injected fact is held out as a near-duplicate", () => {
    const injection = buildMemoryInjection(rows, null, options());
    expect(injected(injection.blocks, BELLE)).toBeLessThanOrEqual(3);
    expect(injected(injection.blocks, RIYO)).toBeLessThanOrEqual(3);
    expect(Object.values(injection.fates).filter((fate) => fate === "near-duplicate").length).toBeGreaterThan(0);
  });

  it("control: distinct details stay (Welden in the library, the grain-stalk letter, Belle's relief)", () => {
    const { blocks } = buildMemoryInjection(rows, null, options());
    const all = `${blocks.facts}\n${blocks.session_details}`;
    expect(all).toMatch(/Welden/);
    expect(all).toMatch(/grain stalk/);
    expect(all).toMatch(/relief and irritation/);
  });
});
