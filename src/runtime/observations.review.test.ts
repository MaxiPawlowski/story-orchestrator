import { observationKey, type EngineState, type NormalizedStory } from "@engine/index";
import { heldSecrets, withoutSecretLines } from "@memory/heldSecrets";
import type { EpistemicEntry } from "@memory/types";
import { createObservations, rollbackObservations, sanitizeObservations, type ObservationsRuntimeState } from "./observationRecords";
import { OBSERVATION_KIT } from "./observationKit";

const { recordsAt: observationRecordsAt, record: recordObservations, reconcile: reconcileObservations, rolls: observationRolls } = OBSERVATION_KIT;
import { composeObservations, observationLogRows } from "./observationView";
import { cardNotices } from "../components/drawer/HudCard";
import { OBSERVATION_CORPUS, corpusEngine, observationLabStory, playCorpus } from "../../test/support/observationLab";
import type { RuntimeSnapshot } from "./types";

const ids = OBSERVATION_CORPUS.chance;

const run = (story: NormalizedStory = observationLabStory(), turns = OBSERVATION_CORPUS.script.length) => {
  const engine = corpusEngine(story);
  let records: ObservationsRuntimeState = createObservations();
  for (let turn = 0; turn < turns; turn += 1) {
    playCorpus(engine, turn + 1, turn);
    const entry = engine.stateLog.at(-1);
    if (entry) records = recordObservations(records, observationRecordsAt(story, ids, entry));
  }
  return { engine, story, state: engine.serialize(), records };
};

const lines = (story: NormalizedStory, state: EngineState, records: ObservationsRuntimeState, resting?: (text: string) => string) =>
  composeObservations({ story, state, castNames: { tom: "Tom" }, records: records.records, resting }) ?? [];

const secret = (content: string, hiddenFrom = "Tom"): EpistemicEntry =>
  ({ id: "secret-1", subject: "Ada", tag: "hiding", hiddenFrom, content, messageId: 1, createdAt: 1, provenance: { validity: "live" } }) as unknown as EpistemicEntry;

const restingFor = (entries: EpistemicEntry[]) => {
  const secrets = heldSecrets(entries, ["Tom", "Ada"]);
  return (text: string) => withoutSecretLines(text, secrets, null);
};

describe("v2.9 08 slice 3: one record per noticed line, cited by message", () => {
  test("records follow the latches: noticed and missed, at the boundary's message, passive rolls kept for the author", () => {
    const { state, records } = run();
    const expected = Object.entries(OBSERVATION_CORPUS.expected).filter(([, want]) => want.noticed !== null || want.missed !== null);
    expect(records.records).toHaveLength(expected.length);
    expected.forEach(([id, want]) => {
      const record = records.records.find((row) => row.id === id);
      expect(record).toMatchObject({ outcome: want.noticed !== null ? "noticed" : "missed", boundary: want.noticed ?? want.missed, messageId: 2 * (want.noticed ?? want.missed ?? 0) });
    });
    expect(records.records.find((row) => row.id === "o32")?.roll).toMatchObject({ sides: 6, target: 7 });
    expect(records.records.find((row) => row.id === "o01")?.roll).toBeUndefined();
    expect(state.blackboard.values[observationKey("o01")]).toBe(1);
    const rolls = observationRolls(observationLabStory(), records);
    expect(rolls.every((roll) => roll.source === "observation" && roll.narrate === false)).toBe(true);
    expect(rolls.find((roll) => roll.key.includes("o32"))?.outcome).toBe("failure");
  });

  test("a rollback drops records at or after the message; replay rebuilds the same records", () => {
    const { records } = run();
    const cut = rollbackObservations(records, 12);
    expect(cut.records.every((row) => row.messageId < 12)).toBe(true);
    const upTo = run(observationLabStory(), 5).records;
    expect(cut.records).toEqual(upTo.records);
    const replayed = run().records;
    expect(replayed).toEqual(records);
  });

  test("reopen: sanitize keeps a stored copy and drops malformed rows", () => {
    const { records } = run();
    const stored = JSON.parse(JSON.stringify(records)) as Record<string, unknown>;
    expect(sanitizeObservations(stored)).toEqual(records);
    expect(sanitizeObservations({ records: [{ id: 1 }, ...records.records.slice(0, 1)], retired: [{ text: 3 }] })).toEqual({ records: records.records.slice(0, 1), retired: [] });
    expect(sanitizeObservations(undefined)).toEqual(createObservations());
  });
});

describe("v2.9 08 slice 3: the player projection", () => {
  test("earned lines only, newest first, with provenance; nothing unnoticed reaches the view", () => {
    const { story, state, records } = run();
    const shown = lines(story, state, records);
    const noticed = Object.values(OBSERVATION_CORPUS.expected).filter((want) => want.noticed !== null).length;
    expect(shown).toHaveLength(noticed);
    expect(shown.map((line) => line.boundary)).toEqual([...shown.map((line) => line.boundary)].sort((a, b) => b - a));
    const texts = new Set(shown.map((line) => line.text));
    OBSERVATION_CORPUS.observations.filter((observation) => OBSERVATION_CORPUS.expected[observation.id].noticed === null)
      .forEach((observation) => expect(texts.has(observation.text)).toBe(false));
    const rope = shown.find((line) => line.text.startsWith("The ferry rope"));
    expect(rope).toMatchObject({ from: "From Tom", messageId: 2 });
    expect(shown.find((line) => line.text.startsWith("Reeds bend"))?.at).toBe("At The river");
    expect(JSON.stringify(shown)).not.toMatch(/"id"|o\d\d|obs_|missed|d6|roll/);
  });

  test("the card shows the lines of the last boundary, at most three, and counts only earned ones", () => {
    const { story, state, records } = run(observationLabStory(), 6);
    const shown = lines(story, state, records);
    const fresh = shown.filter((line) => line.fresh);
    expect(fresh.length).toBeGreaterThan(3);
    const card = cardNotices({ game: { observations: shown } } as unknown as RuntimeSnapshot);
    expect(card.lines).toHaveLength(3);
    expect(card.more).toBe(fresh.length - 3);
  });

  test("the log says only that something was noticed", () => {
    const { engine, story, state, records } = run();
    const rows = observationLogRows(lines(story, state, records), engine.stateLog);
    expect(rows.every((row) => row.text === "Noticed something")).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  test("a line naming someone the player has not met waits until they are known", () => {
    const raw = OBSERVATION_CORPUS.observations;
    const story = observationLabStory({ observations: [...raw, { id: "named", text: "Oriel Vasque's seal is on the gate.", when: { q: "met_tom", op: "==", v: true } }] });
    const early = run(story, 2);
    expect(lines(story, early.state, early.records).some((line) => line.text.includes("Vasque"))).toBe(false);
    const late = run(story, 8);
    expect(lines(story, late.state, late.records).some((line) => line.text.includes("Vasque"))).toBe(true);
  });

  test("held secrets: a line restating a secret in known words is withheld, also when the narrator privately knows it and when the secret comes after the latch", () => {
    const story = observationLabStory({ observations: [{ id: "flour", text: "Fresh flour dust covers the cellar door.", when: { q: "met_tom", op: "==", v: true } },
      { id: "mist", text: "Mist sits low over the landing.", when: { q: "met_tom", op: "==", v: true } }] });
    const { state, records } = run(story, 3);
    expect(lines(story, state, records).map((line) => line.text)).toHaveLength(2);
    const hidden = restingFor([secret("that fresh flour dust hides the cellar door")]);
    expect(lines(story, state, records, hidden).map((line) => line.text)).toEqual(["Mist sits low over the landing."]);
    const narratorKnows = restingFor([secret("that fresh flour dust hides the cellar door", "the player")]);
    expect(lines(story, state, records, narratorKnows).map((line) => line.text)).toEqual(["Mist sits low over the landing."]);
    const card = cardNotices({ game: { observations: lines(story, state, records, hidden) } } as unknown as RuntimeSnapshot);
    expect(card.lines.join(" ")).not.toMatch(/flour/);
  });

  test("a story can switch the surface off", () => {
    const story = observationLabStory({ display: { observations: false } });
    const { state, records } = run(story, 3);
    expect(composeObservations({ story, state, castNames: {}, records: records.records })).toBeUndefined();
  });
});

describe("v2.9 08 slice 3: story updates reconcile the records", () => {
  test("same identity keeps the record, a changed identity drops it, a removed line moves to the author-only retired list", () => {
    const { story, records } = run();
    const list = JSON.parse(JSON.stringify(OBSERVATION_CORPUS.observations)) as Array<Record<string, unknown>>;
    const next = observationLabStory({ observations: list.filter((entry) => entry.id !== "o03").map((entry) => (entry.id === "o01" ? { ...entry, text: "Frayed rope." }
      : entry.id === "o02" ? { ...entry, rev: 2 } : entry)) });
    const reconciled = reconcileObservations(records, story, next) as ObservationsRuntimeState;
    expect(reconciled.records.some((row) => row.id === "o01")).toBe(true);
    expect(reconciled.records.some((row) => row.id === "o02")).toBe(false);
    expect(reconciled.records.some((row) => row.id === "o03")).toBe(false);
    expect(reconciled.retired).toEqual([expect.objectContaining({ id: "o03", text: "Fresh scratches circle the lock of the dock shed." })]);
    expect(reconcileObservations(undefined, story, next)).toBeUndefined();
  });
});
