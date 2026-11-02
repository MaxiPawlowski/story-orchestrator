import { playerActs } from "./playerActs";
import { directlyAddressed, vocativeMembers } from "./directAddress";

const ROSTER = [{ id: "a", name: "Mara" }, { id: "b", name: "Finn" }, { id: "c", name: "Narrator" }];

describe("v3.0 19 round 3: playerActs", () => {
  it.each([
    "I walk to the door and knock.",
    "We pack our gear and set out right away.",
    "Something moves; I draw my blade and step forward.",
    "When we stop to rest, I check everyone's boots.",
    "I stop and listen. Is anyone following us?",
    "*draws a blade*",
  ])("an action: %s", (line) => expect(playerActs(line)).toBe(true));

  it.each([
    "We should find shelter.",
    "I think this is a trap.",
    "All right. I'll think it over tonight.",
    "How long until sundown?",
    "\"I run,\" she said.",
  ])("not an action: %s", (line) => expect(playerActs(line)).toBe(false));
});

describe("v3.0 19 round 3: vocativeMembers", () => {
  it("names every member called by name, and directlyAddressed still wants exactly one", () => {
    expect(vocativeMembers(ROSTER, "Mara, Finn, how are you two holding up?")).toEqual(["a", "b"]);
    expect(directlyAddressed(ROSTER, "Mara, Finn, how are you two holding up?")).toBeNull();
    expect(vocativeMembers(ROSTER, "I give Finn a boost over the wall.")).toEqual([]);
    expect(directlyAddressed(ROSTER, "Finn, wait here.")).toBe("b");
  });
});
