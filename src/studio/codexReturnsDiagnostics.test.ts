import { labRaw } from "../../test/support/codexLab";
import { runDiagnostics } from "./diagnostics";

type RawPlace = { id: string; returns?: Array<Record<string, unknown>> } & Record<string, unknown>;

const is = (key: string) => ({ q: key, op: "==", v: true });

const placesWith = (change: (places: RawPlace[]) => RawPlace[] = (places) => places): Record<string, unknown> => {
  const raw = labRaw();
  const codex = raw.codex as { people: unknown[]; places: RawPlace[] };
  const returns: Record<string, Array<Record<string, unknown>>> = {
    boathouse: [{ id: "door", text: "The back door still hangs off one hinge.", when: is("lost") }],
    mill: [{ id: "wheel", text: "The wheel has stopped at last.", when: is("paid") }],
  };
  const places = codex.places.map((place) => (returns[place.id] ? { ...place, returns: returns[place.id] } : place));
  return { ...raw, codex: { ...codex, places: change(JSON.parse(JSON.stringify(places)) as RawPlace[]) } };
};

const door = (places: RawPlace[]) => places.find((place) => place.id === "boathouse")!.returns!.find((back) => back.id === "door")!;

describe("M52e E6: authoring diagnostics", () => {
  test("a return naming a person not known with it warns; the clean story does not", () => {
    const raw = placesWith((list) => { door(list).text = "Oriel Vasque left the door open."; return list; });
    const flagged = runDiagnostics(raw as never).filter((entry) => entry.code === "disclosure-names-unknown-entity");
    expect(flagged.map((entry) => entry.path)).toEqual(["codex.places.1.returns.0.text"]);
    expect(runDiagnostics(placesWith() as never).filter((entry) => entry.code === "disclosure-names-unknown-entity")).toEqual([]);
  });

  test("a return waiting for an unreachable checkpoint is never read", () => {
    const raw = placesWith((list) => { door(list).when = { reached: "end" }; return list; });
    (raw.transitions as unknown[]).splice(2, 1);
    const flagged = runDiagnostics(raw as never).filter((entry) => entry.code === "codex-fact-never-read");
    expect(flagged.some((entry) => entry.path === "codex.places.1.returns.0")).toBe(true);
  });
});
