import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { plantedModel, recordingModel } from "../../test/support/modelCall";
import { generateReviewedEncounters, parseEncounters, renderEncounterCriticPrompt, renderEncounterPrompt, runPoolChecks } from "./encounters";
import { mergeExpansions } from "./merge";
import { encounterOffers, isEncounterPool } from "./paths";
import { findEncounterCandidate, findStubExpansionCandidate, planEncounterPool } from "./planner";
import { revalidateExpansion } from "./revalidate";
import { EXPANSION_CONTRACT, type ExpansionCacheEntry, type GeneratedEncounter } from "./types";

const ARRIVE = { q: "reached_walls", op: "==", v: true };

const raw = (stretch: Record<string, unknown> | null = { mode: "open", pace: "brief", offer: ["encounters"], arrive_when: ARRIVE }) => ({
  format: 2,
  id: "pool-test",
  title: "Pool test",
  description: "A road between a camp and a city.",
  qualities: [
    { key: "left_camp", type: "bool", source: "extractor", rubric: "The party left camp." },
    { key: "reached_walls", type: "bool", source: "extractor", rubric: "The party reached the walls." },
  ],
  checkpoints: [
    { id: "camp", name: "Camp", objective: "Break camp.", type: "anchor", start: true },
    { id: "road", name: "On the road", objective: "Reach the walls.", type: "intermediate", guidance: "Late summer, a dusty road.", ...(stretch ? { stretch } : {}) },
    { id: "walls", name: "The walls", player_name: "Wendhope's walls", objective: "Arrive.", type: "anchor" },
  ],
  transitions: [
    { from: "camp", to: "road", priority: 1, gate: { q: "left_camp", op: "==", v: true } },
    { from: "road", to: "walls", priority: 1, gate: ARRIVE },
  ],
  roster: [],
});

const story = (stretch?: Record<string, unknown> | null): NormalizedStoryV2 => parseStoryV2OrThrow(raw(stretch));

const GOOD = {
  encounters: [
    { title: "A broken cart", situation: "A merchant's cart lies tipped at the roadside, its wheel split, and the driver is shouting for help." },
    { title: "Smoke on the ridge", situation: "A thin column of smoke rises from the ridge, too steady for a campfire and too far to be sure." },
    { title: "The toll keeper", situation: "A bored toll keeper has set a rope across the road and wants a coin from every traveller." },
    { title: "A lost goat", situation: "A goat with a bell round its neck wanders out of the hedge and will not be driven off." },
  ],
};

const planned = (loaded = story()) => planEncounterPool(
  { values: { tension_current: 0.25 } }, findEncounterCandidate(loaded, "camp")!, "canon line", ["a fact"],
);

const encounters = (count = 4): GeneratedEncounter[] => parseEncounters(JSON.stringify({ encounters: GOOD.encounters.slice(0, count) })).encounters;

const entry = (patch: Partial<ExpansionCacheEntry> = {}): ExpansionCacheEntry => ({
  key: "road->encounters", kind: "encounters", status: "validated", contract: EXPANSION_CONTRACT, sourceCheckpointId: "road", stubId: "road", targetAnchorId: "walls",
  basis: {}, blackboardVersionSum: 0, beats: [], encounters: encounters(), needsReview: false, verdicts: [], codeCheck: null, insertedCheckpointIds: [],
  lastError: null, attempts: 1, origin: "active", updatedAt: "2026-10-13T00:00:00.000Z", ...patch,
});

describe("v2.8 19: the encounter pool candidate", () => {
  it("is found one hop before the stretch and at the stretch itself, with the stretch as its own source", () => {
    const loaded = story();
    const before = findEncounterCandidate(loaded, "camp");
    expect(before).toMatchObject({ kind: "encounters", sourceCheckpointId: "road", stubId: "road", targetAnchorId: "walls" });
    expect(findEncounterCandidate(loaded, "road")).toMatchObject({ kind: "encounters", stubId: "road", targetAnchorId: "walls" });
    expect(findEncounterCandidate(loaded, "walls")).toBeNull();
  });

  it("needs offer: encounters; a plain open stretch and a closed stub have no pool", () => {
    expect(findEncounterCandidate(story({ mode: "open", pace: "brief", arrive_when: ARRIVE }), "camp")).toBeNull();
    expect(findEncounterCandidate(story(null), "camp")).toBeNull();
  });

  it("an open stretch is not a chain stub, so the chain route never sees it", () => {
    expect(findStubExpansionCandidate(story(), "camp")).toBeNull();
  });

  it("plans a pool of four with no state delta, no trajectory and no progress", () => {
    const input = planned();
    expect(input).toMatchObject({ beats: 4, deltas: [], tensionTrajectory: [], generationBias: null, canon: "canon line", facts: ["a fact"] });
    expect(input.candidate.kind).toBe("encounters");
  });
});

describe("v2.8 19: the encounter prompt and the pool checks", () => {
  it("carries the place, the destination's public name, the guidance and the agency clauses, and never a task or a progress threshold", () => {
    const prompt = renderEncounterPrompt(story(), planned());
    expect(prompt).toContain('"On the road"');
    expect(prompt).toContain("Wendhope's walls");
    expect(prompt).toContain("Late summer, a dusty road.");
    expect(prompt).toContain("Write 4 optional situations");
    expect(prompt).toContain("do not narrate {{user}} acting");
    expect(prompt).not.toContain("Reach the walls.");
    expect(prompt).not.toContain("Progress threshold");
    expect(prompt).not.toContain("State delta");
  });

  it("the critic prompt names the policy and fails a situation that resolves itself or steers the party", () => {
    const prompt = renderEncounterCriticPrompt(story(), planned(), encounters(), []);
    expect(prompt).toContain("narrates the player's own act");
    expect(prompt).toContain("resolves itself");
    expect(prompt).toContain("do not narrate {{user}} acting");
    expect(prompt).toContain('{"pass":true|false');
  });

  it("parses the wrapped and bare array forms and gives each encounter its index as its id", () => {
    expect(parseEncounters(JSON.stringify(GOOD)).encounters.map((item) => item.id)).toEqual(["0", "1", "2", "3"]);
    expect(parseEncounters(JSON.stringify(GOOD.encounters)).issues).toEqual([]);
    expect(parseEncounters(`\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\``).issues).toEqual([]);
    expect(parseEncounters("nonsense").issues.length).toBeGreaterThan(0);
  });

  it.each(["outcomes", "gate", "progress", "deltas", "objective", "exit"])("refuses an encounter that carries %s", (key) => {
    const parsed = parseEncounters(JSON.stringify({ encounters: [{ ...GOOD.encounters[0], [key]: key === "outcomes" ? [] : "x" }] }));
    expect(parsed.issues).toEqual([`encounters.0.${key}: an encounter carries no outcome, gate, progress, objective or exit`]);
  });

  it("holds 3 to 5 encounters with distinct titles, short titles and playable situations", () => {
    expect(runPoolChecks(encounters(3)).ok).toBe(true);
    expect(runPoolChecks(encounters(2)).issues[0]).toContain("3 to 5");
    const six = [...encounters(4), ...encounters(4).slice(0, 2).map((item, index) => ({ ...item, id: `x${index}`, title: `${item.title} again` }))];
    expect(runPoolChecks(six).issues[0]).toContain("not 6");
    const duplicate = encounters(4).map((item, index) => (index === 1 ? { ...item, title: "A BROKEN CART" } : item));
    expect(runPoolChecks(duplicate).issues).toEqual(["encounter 2 'A BROKEN CART' repeats an earlier title"]);
    const long = encounters(4).map((item, index) => (index === 0 ? { ...item, title: "A very long and winding title here" } : item));
    expect(runPoolChecks(long).issues[0]).toContain("more than 6 words");
    const short = encounters(4).map((item, index) => (index === 0 ? { ...item, situation: "Short." } : item));
    expect(runPoolChecks(short).issues[0]).toContain("too short");
    const huge = encounters(4).map((item, index) => (index === 0 ? { ...item, situation: "x".repeat(401) } : item));
    expect(runPoolChecks(huge).issues[0]).toContain("over 400");
  });

  it("flags a situation that writes the player's own act, by the player's name or by {{user}}", () => {
    const written = encounters(4).map((item, index) => (index === 2 ? { ...item, situation: "Max walks to the toll keeper and pays him." } : item));
    expect(runPoolChecks(written, ["Max"]).issues).toEqual(["encounter 3 'The toll keeper' narrates the player's own act"]);
    expect(runPoolChecks(written, []).ok).toBe(true);
    const user = encounters(4).map((item, index) => (index === 0 ? { ...item, situation: "{{user}} accepts the driver's plea for help at once." } : item));
    expect(runPoolChecks(user).ok).toBe(false);
  });
});

describe("v2.8 19: generating a pool on the expansion route (mocked model, plumbing only)", () => {
  const ask = { role: "authoring", pass: "generation" } as const;

  it("generates, code-checks, then asks the critic once on the critic pass", async () => {
    const model = recordingModel((_prompt, request) => (request.pass === "critic" ? '{"pass": true, "issues": []}' : JSON.stringify(GOOD)));
    const result = await generateReviewedEncounters(story(), planned(), model, ask, ["Max"]);
    expect(result.encounters).toHaveLength(4);
    expect(result.needsReview).toBe(false);
    expect(result.codeCheck).toMatchObject({ ok: true, progressTotal: 0 });
    expect(model.calls.map((call) => call.ask.pass)).toEqual(["generation", "critic"]);
  });

  it("a failing critic needs review and keeps the pool for the author", async () => {
    const model = recordingModel((_prompt, request) => (request.pass === "critic" ? '{"pass": false, "issues": ["narrates the player"]}' : JSON.stringify(GOOD)));
    const result = await generateReviewedEncounters(story(), planned(), model, ask);
    expect(result.needsReview).toBe(true);
    expect(result.verdict.issues).toEqual(["narrates the player"]);
    expect(result.encounters).toHaveLength(4);
  });

  it("repairs invalid JSON once, and a pool that still carries an outcome fails without a critic call", async () => {
    const withOutcome = JSON.stringify({ encounters: [{ ...GOOD.encounters[0], gate: { q: "reached_walls", op: "==", v: true } }, ...GOOD.encounters.slice(1)] });
    const model = recordingModel(() => withOutcome);
    const result = await generateReviewedEncounters(story(), planned(), model, ask);
    expect(result.issues[0]).toContain("an encounter carries no outcome");
    expect(result.needsReview).toBe(true);
    expect(model.calls.map((call) => call.ask.pass)).toEqual(["generation", "generation"]);
  });

  it("repairs a pool that fails the code checks once, then judges the repaired one", async () => {
    let call = 0;
    const model = recordingModel((_prompt, request) => {
      if (request.pass === "critic") return '{"pass": true, "issues": []}';
      call += 1;
      return JSON.stringify(call === 1 ? { encounters: GOOD.encounters.slice(0, 2) } : GOOD);
    });
    const result = await generateReviewedEncounters(story(), planned(), model, ask);
    expect(result.codeCheck?.ok).toBe(true);
    expect(result.encounters).toHaveLength(4);
    expect(model.calls.map((entry) => entry.ask.pass)).toEqual(["generation", "generation", "critic"]);
  });

  it("a planted response is code-checked and never sent to a critic", async () => {
    const result = await generateReviewedEncounters(story(), planned(), plantedModel, { ...ask, debugResponse: JSON.stringify(GOOD) });
    expect(result.needsReview).toBe(false);
    expect(result.verdict.raw).toBe("DEBUG");
  });
});

describe("v2.8 19: a pool is a cache entry with no routes", () => {
  it("is told apart from a chain by kind, and the contract is the current one", () => {
    expect(isEncounterPool(entry())).toBe(true);
    expect(isEncounterPool({ kind: "chain" })).toBe(false);
    expect(isEncounterPool({})).toBe(false);
    expect(EXPANSION_CONTRACT).toBe(3);
  });

  it("never merges into the played graph, with or without beats", () => {
    const rawStory = raw();
    const merged = mergeExpansions(rawStory, { "road->encounters": entry() });
    const plain = mergeExpansions(rawStory, {});
    expect(merged.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(plain.checkpoints.map((checkpoint) => checkpoint.id));
    expect(merged.transitions).toEqual(plain.transitions);
  });

  it("route revalidation skips a pool: no routes to enumerate, no drift against a snapshot", () => {
    expect(revalidateExpansion(story(), entry(), { left_camp: true })).toEqual({ status: "pass", validBeatCount: 0, issues: [] });
    expect(revalidateExpansion(story(), entry({ targetAnchorId: "gone" }), {}).status).toBe("pass");
  });

  it("offers the newest usable pool for the stretch and nothing from a review, failed or other pool", () => {
    const older = entry({ key: "a", updatedAt: "2026-10-13T00:00:00.000Z", encounters: encounters(3) });
    const newer = entry({ key: "b", status: "inserted", updatedAt: "2026-10-13T01:00:00.000Z" });
    expect(encounterOffers({ a: older, b: newer }, "road")).toHaveLength(4);
    expect(encounterOffers({ a: older }, "road")).toHaveLength(3);
    expect(encounterOffers({ a: entry({ status: "needs_review" }) }, "road")).toEqual([]);
    expect(encounterOffers({ a: entry({ status: "failed" }) }, "road")).toEqual([]);
    expect(encounterOffers({ a: entry() }, "camp")).toEqual([]);
    expect(encounterOffers({ a: entry({ kind: "chain" }) }, "road")).toEqual([]);
  });
});
