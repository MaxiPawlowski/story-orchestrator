import * as recorded from "../../test/fixtures/t6-4-epistemic-pass.json";
import { activeEpistemic, applyEpistemicSignals } from "./epistemic";
import { heldSecrets, withheldEntryIds } from "./heldSecrets";
import { parseEpistemicLine, parseEpistemicRetire } from "./parse";
import type { EpistemicEntry, MemoryEntry, ParsedEpistemicSignal } from "./types";

const store = recorded.epistemic as unknown as EpistemicEntry[];
const memory = recorded.memory as unknown as MemoryEntry[];
const NAMES = ["Adolion Narrator", "Natalia", "Shiya", "Ronan", "Welden", "Leila", "Javon", "Max Nightriver"];

function replayPass(response: string) {
  const signals: ParsedEpistemicSignal[] = [];
  const retire = new Set<number>();
  for (const line of response.split(/\r?\n/)) {
    parseEpistemicRetire(line).forEach((index) => retire.add(index));
    const signal = parseEpistemicLine(line.trim());
    if (signal) signals.push(signal);
  }
  const ids = [...retire].map((index) => store[index - 1]?.id).filter((id): id is string => Boolean(id));
  return applyEpistemicSignals(store, signals, { boundary: recorded.pass.boundary, messageId: recorded.pass.messageId }, ids);
}

const live = (entries: EpistemicEntry[], id: string) => activeEpistemic(entries).some((entry) => entry.id === id);
const textsWithheldFrom = (entries: EpistemicEntry[], member: string[]) => {
  const withheld = withheldEntryIds(memory, heldSecrets(entries, NAMES), member);
  return memory.filter((entry) => withheld.has(entry.id)).map((entry) => entry.text);
};

describe("T6-4: the epistemic pass retires every numbered row while restating them (payloads.jsonl:22/:25)", () => {
  it("is the recorded reply: ten [retire] lines over ten existing rows", () => {
    expect(store).toHaveLength(10);
    expect(recorded.pass.response.split("\n").filter((line) => line.startsWith("[retire]"))).toHaveLength(10);
  });

  it("keeps both concealers' [hiding] rows from Natalia, because the same reply restates them", () => {
    const { entries } = replayPass(recorded.pass.response);
    expect(live(entries, "e3")).toBe(true);
    expect(live(entries, "e4")).toBe(true);
    expect(activeEpistemic(entries).filter((entry) => entry.tag === "hiding" && entry.hiddenFrom === "Natalia").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the joint concealers' row and Natalia's suspicion, which the reply restates", () => {
    const { entries } = replayPass(recorded.pass.response);
    expect(live(entries, "e9")).toBe(true);
    expect(live(entries, "e10")).toBe(true);
  });

  it("does not add the restatement next to the row it kept", () => {
    const { entries } = replayPass(recorded.pass.response);
    expect(activeEpistemic(entries).filter((entry) => entry.subject === "Max Nightriver" && entry.content.includes("thrumming"))).toHaveLength(1);
  });

  it("withholds the seals rows from Natalia and keeps them for Shiya", () => {
    const { entries } = replayPass(recorded.pass.response);
    const fromNatalia = textsWithheldFrom(entries, ["natalia"]);
    expect(fromNatalia).toEqual(expect.arrayContaining(["The seals beneath the Nightriver Estate are failing.", "Shiya agrees to keep the failing seals secret from Natalia."]));
    expect(textsWithheldFrom(entries, ["shiya"])).toEqual([]);
    expect(textsWithheldFrom(entries, ["max nightriver"])).toEqual([]);
  });

  it("control: a retired row the reply does not restate, written at an earlier boundary, still goes", () => {
    const { entries, retired } = replayPass(recorded.pass.response);
    expect(live(entries, "e6")).toBe(false);
    expect(retired.map((entry) => entry.id)).toContain("e6");
  });

  it("control: a [retire] with no restatement retires the [hiding] row", () => {
    const { entries } = replayPass("[retire] 3");
    expect(live(entries, "e3")).toBe(false);
  });
});

describe("T6-4: a [hiding] row with two concealers counts both as knowers", () => {
  it("keeps the secret for Shiya when only the joint row holds it", () => {
    const joint = store.filter((entry) => entry.id === "e9");
    const withheld = withheldEntryIds(memory, heldSecrets(joint, NAMES), ["shiya"]);
    expect(withheld.size).toBe(0);
    expect(withheldEntryIds(memory, heldSecrets(joint, NAMES), ["natalia"]).size).toBeGreaterThan(0);
  });
});
