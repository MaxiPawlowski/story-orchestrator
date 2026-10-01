import * as recorded from "../../test/fixtures/t2-2-secrets.memory.json";
import { capEpistemic, dropCommonKnowledge } from "./epistemic";
import type { EpistemicEntry, ParsedEpistemicSignal } from "./types";

const store = recorded.epistemic as unknown as EpistemicEntry[];
const TURN_ONE = ["t1-shiya-knows", "t1-shiya-knows-2", "t1-max-hiding", "t1-natalia-suspects"];
const bySubject = (entries: EpistemicEntry[], subject: string) => entries.filter((entry) => entry.subject === subject);

describe("T2-2: the epistemic cap keeps turn 1's secret (evidence-*.json slices.memory.epistemic)", () => {
  it("starts from the recorded store plus turn 1: 74 rows, Shiya 14 (8 retired), Max 7 live", () => {
    expect(store).toHaveLength(74);
    expect(bySubject(store, "Shiya")).toHaveLength(14);
    expect(bySubject(store, "Shiya").filter((entry) => entry.supersededBy)).toHaveLength(8);
    expect(bySubject(store, "Max Nightriver").filter((entry) => !entry.supersededBy)).toHaveLength(7);
  });

  it("keeps every live turn-1 row: retired rows never push a live one out of its subject's cap", () => {
    const capped = capEpistemic(store);
    expect(TURN_ONE.filter((id) => !capped.some((entry) => entry.id === id))).toEqual([]);
  });

  it("still bounds each subject: at most 12 live and 12 retired rows", () => {
    const capped = capEpistemic(store);
    for (const subject of ["Shiya", "Max Nightriver", "Natalia", "Javon"]) {
      expect(bySubject(capped, subject).filter((entry) => !entry.supersededBy).length).toBeLessThanOrEqual(12);
      expect(bySubject(capped, subject).filter((entry) => entry.supersededBy).length).toBeLessThanOrEqual(12);
    }
  });

  it("control: live rows beyond the subject cap still go, the oldest first", () => {
    const live = Array.from({ length: 14 }, (_, index) => ({ id: `n${index}`, subject: "Shiya", tag: "knows", content: `fact ${index}`, createdAt: index }));
    const capped = capEpistemic(live as EpistemicEntry[]);
    expect(capped.map((entry) => entry.id)).toEqual(live.slice(2).map((entry) => entry.id));
  });
});

describe("T2-2: the common-knowledge rule never drops a [knows] line that restates someone's secret", () => {
  const sig = (tag: ParsedEpistemicSignal["tag"], subject: string, content: string): ParsedEpistemicSignal => ({ tag, subject, content });
  const present = ["Shiya", "Natalia", "Ronan", "Welden"];
  const batch = ["Shiya", "Ronan", "Welden"].map((subject) => sig("knows", subject, "the seals beneath the Nightriver estate are failing"));
  const hiding = store.filter((entry) => entry.id === "t1-max-hiding");

  it("keeps it when the store already holds the [hiding] row the batch restates", () => {
    expect(dropCommonKnowledge(batch, present, hiding)).toEqual(batch);
  });

  it("keeps it when the batch's own [unaware] line says it in other words", () => {
    const unaware = sig("unaware", "Natalia", "that the seals under the estate are failing");
    expect(dropCommonKnowledge([...batch, unaware], present)).toEqual([...batch, unaware]);
  });

  it("control: with nothing contesting it, three identical [knows] lines are the scene and go", () => {
    expect(dropCommonKnowledge(batch, present)).toEqual([]);
  });
});
