import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWiCuratorPrompt } from "./prompt";
import { parseCuratorResponse } from "./parse";
import { applyCuratorPatch, decidedOp, declinedOps, planCuratorProposal, previewCuratorOp } from "./proposal";
import { findSpanFuzzy } from "./fuzzy";
import { entriesForScope, entryRef } from "./scope";
import { CURATOR_SHOWN_CONTENT, FUZZY_ANCHOR_THRESHOLD, type CuratorEntryView, type CuratorProposalRecord, type WiCuratorOp } from "./types";

const long = `${"The harbour wall was raised after the great storm, stone by stone, by the fishing families. ".repeat(6)}The last line says who pays for its upkeep.`;

const entries = (): CuratorEntryView[] => [
  { lorebook: "Story Lore", comment: "The bridge", keys: ["bridge"], content: "The bridge stands, its ropes new and taut. Travellers cross freely.", disabled: false, uid: 4 },
  { lorebook: "Story Lore", comment: "The ferryman", keys: ["ferryman"], content: "Nobody has seen the ferryman for a season.", disabled: true, uid: 7 },
  { lorebook: "Story Lore", comment: "The harbour wall", keys: ["wall"], content: long, disabled: false, uid: 9 },
];

const prompt = (list = entries(), declined: WiCuratorOp[] = []) => buildWiCuratorPrompt({ storyTitle: "Crossing", checkpointName: "The bank", objective: "Cross", canon: "", openArcs: [], entries: list, declined });

describe("T17.1 rewrite-length refusal", () => {
  it("marks an entry shown in part, and refuses a rewrite of it at plan time", () => {
    expect(long.replace(/\s+/g, " ").trim().length).toBeGreaterThan(CURATOR_SHOWN_CONTENT);
    expect(prompt()).toContain('#9 "The harbour wall" (Story Lore) [shown in part — patch only]');
    expect(prompt()).not.toContain('"The bridge" (Story Lore) [shown in part');
    const plan = planCuratorProposal(parseCuratorResponse("[rewrite] #9 || The wall fell.", entries()), entries());
    expect(plan.records).toEqual([]);
    expect(plan.dropped).toEqual(["rewrite: only part of this entry was shown; propose a [patch]"]);
  });

  it("refuses the same rewrite at the write edge, where the preview runs again", () => {
    const op: WiCuratorOp = { kind: "rewrite", lorebook: "Story Lore", comment: "The harbour wall", text: "The wall fell.", uid: 9 };
    expect(previewCuratorOp(op, entries()[2])).toEqual({ ok: false, message: "only part of this entry was shown; propose a [patch]" });
  });

  it("control: a rewrite of an entry shown whole still plans, and a patch of the long one does too", () => {
    const plan = planCuratorProposal(parseCuratorResponse("[rewrite] #4 || The bridge is gone.\n[patch] #9 || The last line || its upkeep. || The town pays.", entries()), entries());
    expect(plan.records.map((record) => record.op.kind)).toEqual(["rewrite", "patch"]);
  });
});

describe("T17.2 uid addressing", () => {
  it("fills the uid from the host entry and lists it in the prompt", () => {
    expect(entriesForScope("Story Lore", [{ uid: 12, comment: "Gate", content: "x", key: [] }])[0]).toMatchObject({ uid: 12, comment: "Gate" });
    expect(prompt()).toContain('#4 "The bridge" (Story Lore)');
  });

  it("resolves an op by #uid and carries the uid on the op", () => {
    expect(parseCuratorResponse("[disable] #4", entries()).ops).toEqual([{ kind: "disable", lorebook: "Story Lore", comment: "The bridge", uid: 4 }]);
  });

  it("resolves an exact title, case- and space-insensitively, and carries its uid", () => {
    expect(parseCuratorResponse("[enable]  the FERRYMAN ", entries()).ops).toEqual([{ kind: "enable", lorebook: "Story Lore", comment: "The ferryman", uid: 7 }]);
  });

  it("reads a trailing single-pipe reason as a reason, not part of the title", () => {
    expect(parseCuratorResponse("[enable] The ferryman | he is back on the river", entries()).ops).toEqual([{ kind: "enable", lorebook: "Story Lore", comment: "The ferryman", uid: 7 }]);
    expect(parseCuratorResponse("[disable] #4 | the bridge fell", entries()).ops).toEqual([{ kind: "disable", lorebook: "Story Lore", comment: "The bridge", uid: 4 }]);
  });

  it("control: a title that itself holds a pipe still matches whole", () => {
    const list = [...entries(), { lorebook: "Story Lore", comment: "North | South road", keys: [], content: "x", disabled: true, uid: 11 }];
    expect(parseCuratorResponse("[enable] North | South road", list).ops).toEqual([{ kind: "enable", lorebook: "Story Lore", comment: "North | South road", uid: 11 }]);
  });

  it("control: a prefix before the pipe is still no match", () => {
    expect(parseCuratorResponse("[disable] The bri | fell", entries()).ops).toEqual([]);
  });

  it("drops a prefix title instead of guessing the entry", () => {
    const proposal = parseCuratorResponse("[disable] The bri\n[enable] The ferryman is back", entries());
    expect(proposal.ops).toEqual([]);
    expect(proposal.dropped).toEqual([
      'disable: "The bri" is not an entry this story owns',
      'enable: "The ferryman is back" is not an entry this story owns',
    ]);
  });

  it("drops an ambiguous title and names the count", () => {
    const twins = [...entries(), { lorebook: "Other Lore", comment: "The bridge", keys: [], content: "Another bridge.", disabled: false, uid: 4 }];
    const proposal = parseCuratorResponse("[disable] The bridge", twins);
    expect(proposal.ops).toEqual([]);
    expect(proposal.dropped).toEqual(['disable: ambiguous: 2 entries titled "The bridge"']);
  });

  describe("an entry named the way the prompt lists it", () => {
    const cripta = (): CuratorEntryView[] => [
      { lorebook: "Abadía Lore", comment: "La Cripta", keys: ["cripta"], content: "Bajo el altar.", disabled: true },
      { lorebook: "Abadía Lore", comment: "El Abad", keys: ["abad"], content: "El abad vigila.", disabled: false },
    ];
    const twins = (): CuratorEntryView[] => [...entries(), { lorebook: "Other Lore", comment: "The bridge", keys: [], content: "Another bridge.", disabled: false, uid: 5 }];

    it("resolves a quoted title with its trailing (Lorebook), the listed shape (live c13)", () => {
      const proposal = parseCuratorResponse('[enable] "La Cripta" (Abadía Lore)\n[why] El grupo ha descendido a la cripta.', cripta());
      expect(proposal.ops).toEqual([{ kind: "enable", lorebook: "Abadía Lore", comment: "La Cripta" }]);
      expect(proposal.dropped).toEqual([]);
    });

    it("the trailing lorebook is case-insensitive, may follow an unquoted title, and keeps the reason and patch parts", () => {
      expect(parseCuratorResponse("[enable] the ferryman (story lore) | he is back", entries()).ops).toEqual([{ kind: "enable", lorebook: "Story Lore", comment: "The ferryman", uid: 7 }]);
      expect(parseCuratorResponse('[patch] "The bridge" (Story Lore) || ropes new || taut. || ropes cut.', entries()).ops).toEqual([
        { kind: "patch", lorebook: "Story Lore", comment: "The bridge", uid: 4, anchor: "ropes new || taut.", replace: "ropes cut." },
      ]);
    });

    it("the trailing lorebook disambiguates two books sharing a title", () => {
      expect(parseCuratorResponse('[disable] "The bridge" (Other Lore)', twins()).ops).toEqual([{ kind: "disable", lorebook: "Other Lore", comment: "The bridge", uid: 5 }]);
      expect(parseCuratorResponse('[disable] "The bridge" (Story Lore)', twins()).ops).toEqual([{ kind: "disable", lorebook: "Story Lore", comment: "The bridge", uid: 4 }]);
    });

    it("control: a lorebook that does not hold the title never resolves to another book's entry", () => {
      const proposal = parseCuratorResponse('[enable] "La Cripta" (Story Lore)\n[disable] "The bridge" (Third Lore)', [...cripta(), ...twins()]);
      expect(proposal.ops).toEqual([]);
      expect(proposal.dropped).toEqual([
        'enable: "La Cripta" is not in Story Lore',
        'disable: "The bridge" is not in Third Lore',
      ]);
    });

    it("control: a bare title shared by two books stays ambiguous, and a title holding parentheses still matches whole", () => {
      expect(parseCuratorResponse('[disable] "The bridge"', twins()).dropped).toEqual(['disable: ambiguous: 2 entries titled "The bridge"']);
      const list = [...entries(), { lorebook: "Story Lore", comment: "Gate (north)", keys: [], content: "x", disabled: true, uid: 12 }];
      expect(parseCuratorResponse('[enable] "Gate (north)"', list).ops).toEqual([{ kind: "enable", lorebook: "Story Lore", comment: "Gate (north)", uid: 12 }]);
      expect(parseCuratorResponse("[enable] Gate (north)", list).ops).toEqual([{ kind: "enable", lorebook: "Story Lore", comment: "Gate (north)", uid: 12 }]);
      expect(parseCuratorResponse('[enable] "Gate (north)" (Story Lore)', list).ops).toEqual([{ kind: "enable", lorebook: "Story Lore", comment: "Gate (north)", uid: 12 }]);
    });

    it("control: an unknown title with a real lorebook is still unknown", () => {
      expect(parseCuratorResponse('[enable] "La Torre" (Abadía Lore)', cripta()).dropped).toEqual(['enable: "La Torre" (Abadía Lore) is not an entry this story owns']);
    });
  });

  it("drops an unknown #uid", () => {
    expect(parseCuratorResponse("[disable] #99", entries()).dropped).toEqual(["disable: #99 is not an entry this story owns"]);
  });

  it("gives entries of two books with the same uid refs that cannot collide", () => {
    const two = [...entries(), { lorebook: "Other Lore", comment: "Tower", keys: [], content: "A tower.", disabled: false, uid: 4 }];
    expect(two.map((entry) => entryRef(entry, two))).toEqual(["#1.4", "#7", "#9", "#2.4"]);
    expect(parseCuratorResponse("[disable] #2.4", two).ops).toEqual([{ kind: "disable", lorebook: "Other Lore", comment: "Tower", uid: 4 }]);
  });

  it("plans against the entry the uid names, and records the uid in the before-image", () => {
    const renamed = entries().map((entry) => (entry.uid === 4 ? { ...entry, comment: "The old bridge" } : entry));
    const plan = planCuratorProposal({ summary: "", dropped: [], ops: [{ kind: "disable", lorebook: "Story Lore", comment: "The bridge", uid: 4 }] }, renamed);
    expect(plan.records).toHaveLength(1);
    expect(plan.records[0].before).toMatchObject({ uid: 4, disabled: false });
  });
});

const record = (ops: CuratorProposalRecord["ops"], extra: Partial<CuratorProposalRecord> = {}): CuratorProposalRecord => ({
  id: "wi-1-1", curator: "wi", at: "", boundary: 5, messageId: 1, checkpointId: "cp1", reason: "test", summary: "", mode: "review", ops, dropped: [], ...extra,
});

describe("T17.3 declined-op memory", () => {
  const rewrite: WiCuratorOp = { kind: "rewrite", lorebook: "Story Lore", comment: "The bridge", text: "The bridge is gone.", uid: 4 };
  const ring = [
    record([{ op: rewrite, status: "rejected" }, { op: { kind: "disable", lorebook: "Story Lore", comment: "The bridge", uid: 4 }, status: "accepted" }]),
    record([{ op: { kind: "enable", lorebook: "Story Lore", comment: "The ferryman", uid: 7 }, status: "rejected" }], { id: "wi-old", checkpointId: "cp0", boundary: 1 }),
    record([{ op: { kind: "note", text: "n", facts: [], replyMessageId: 1 }, status: "rejected" }], { id: "warden-1", curator: "warden" }),
    record([{ op: { kind: "enable", lorebook: "Story Lore", comment: "The ferryman", uid: 7 }, status: "rejected" }], { id: "wi-before-entry", boundary: 2 }),
  ];

  it("keeps only rejected lorebook ops of the active checkpoint since it was entered", () => {
    expect(declinedOps(ring, "cp1", 4)).toEqual([rewrite]);
  });

  it("drops a re-proposal of a declined op, whatever its whitespace or case", () => {
    const plan = planCuratorProposal(parseCuratorResponse("[rewrite] #4 ||   the bridge is GONE.", entries()), entries(), { declined: declinedOps(ring, "cp1", 4) });
    expect(plan.records).toEqual([]);
    expect(plan.dropped).toEqual(['rewrite: "The bridge" was declined earlier']);
  });

  it("control: a different text for the same entry is still proposed", () => {
    const plan = planCuratorProposal(parseCuratorResponse("[rewrite] #4 || The bridge is ash.", entries()), entries(), { declined: declinedOps(ring, "cp1", 4) });
    expect(plan.records).toHaveLength(1);
  });

  it("tells the curator what the author declined, bounded", () => {
    const many = Array.from({ length: 9 }, (_, index): WiCuratorOp => ({ kind: "disable", lorebook: "Story Lore", comment: `Entry ${index}` }));
    const text = prompt(entries(), many);
    expect(text).toContain("THE AUTHOR DECLINED");
    expect(text).toContain("- [disable] Entry 0");
    expect(text).not.toContain("- [disable] Entry 4");
  });

  it("forgets a decline once a rollback drops its record", () => {
    expect(declinedOps(ring.slice(1), "cp1", 4)).toEqual([]);
  });
});

describe("T17.5 fuzzy anchors, review mode only", () => {
  const view = (content: string): CuratorEntryView => ({ lorebook: "Story Lore", comment: "Entry", keys: [], content, disabled: false, uid: 1 });
  const fixture = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/curator-fuzzy/anchors.json"), "utf8")) as {
    threshold: number;
    positives: Array<{ id: string; content: string; anchor: string; span: string }>;
    negatives: Array<{ id: string; content: string; anchor: string }>;
  };

  it("declares the threshold the fixture was labelled against", () => {
    expect(FUZZY_ANCHOR_THRESHOLD).toBe(fixture.threshold);
    expect(fixture.positives.length).toBeGreaterThanOrEqual(10);
    expect(fixture.negatives.length).toBeGreaterThanOrEqual(10);
  });

  it("makes no false match on any anchor-absent negative (the floor)", () => {
    const falseMatches = fixture.negatives.filter((entry) => findSpanFuzzy(entry.content, entry.anchor) !== null).map((entry) => entry.id);
    expect(falseMatches).toEqual([]);
  });

  it("never matches a positive to the wrong span, and reports the lift", () => {
    const outcomes = fixture.positives.map((entry) => {
      expect(applyCuratorPatch(entry.content, entry.anchor, "X").ok).toBe(false);
      const found = findSpanFuzzy(entry.content, entry.anchor);
      return { id: entry.id, found: found !== null, right: found ? entry.content.slice(found.start, found.end) === entry.span : null, score: found?.score ?? null };
    });
    expect(outcomes.filter((outcome) => outcome.right === false)).toEqual([]);
    const lift = outcomes.filter((outcome) => outcome.found).length;
    console.log(`fuzzy anchor lift: ${lift}/${outcomes.length} shortened anchors recovered`, JSON.stringify(outcomes));
    expect(lift).toBeGreaterThan(0);
  });

  it("offers a near match on a review card with the span and score, and accept rewrites the anchor to the exact text", () => {
    const content = "The old stone bridge spans the river Vel, its ropes new and taut. Travellers cross freely at dawn.";
    const op: WiCuratorOp = { kind: "patch", lorebook: "Story Lore", comment: "Entry", anchor: "old bridge spans the river || ropes new and taut", replace: "old bridge lies in the river", uid: 1 };
    const plan = planCuratorProposal({ summary: "", dropped: [], ops: [op] }, [view(content)], { mode: "review" });
    expect(plan.records).toHaveLength(1);
    const fuzzy = plan.records[0].fuzzy!;
    expect(fuzzy.span).toBe("old stone bridge spans the river Vel, its ropes new and taut");
    expect(fuzzy.score).toBeGreaterThanOrEqual(FUZZY_ANCHOR_THRESHOLD);
    const accepted = decidedOp(plan.records[0], "accepted");
    expect(accepted.kind === "patch" && accepted.anchor).toBe(fuzzy.anchor);
    const exact = previewCuratorOp(accepted as WiCuratorOp, view(content));
    expect(exact).toMatchObject({ ok: true, content: "The old bridge lies in the river. Travellers cross freely at dawn." });
  });

  it("auto never takes a fuzzy match", () => {
    const content = "The old stone bridge spans the river Vel, its ropes new and taut.";
    const op: WiCuratorOp = { kind: "patch", lorebook: "Story Lore", comment: "Entry", anchor: "old bridge spans the river || ropes new and taut", replace: "gone", uid: 1 };
    const plan = planCuratorProposal({ summary: "", dropped: [], ops: [op] }, [view(content)], { mode: "auto" });
    expect(plan.records).toEqual([]);
    expect(plan.dropped[0]).toContain("is not in this entry");
  });

  it("an edited text on a near-match card keeps the exact anchor", () => {
    const content = "The old stone bridge spans the river Vel, its ropes new and taut.";
    const op: WiCuratorOp = { kind: "patch", lorebook: "Story Lore", comment: "Entry", anchor: "old bridge spans the river || ropes new and taut", replace: "gone", uid: 1 };
    const [entry] = planCuratorProposal({ summary: "", dropped: [], ops: [op] }, [view(content)], { mode: "review" }).records;
    const edited = decidedOp(entry, "accepted", { ...op, replace: "a ruin" });
    expect(edited).toMatchObject({ anchor: entry.fuzzy!.anchor, replace: "a ruin" });
  });
});
