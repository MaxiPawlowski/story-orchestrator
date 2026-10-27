import { latestSend, pickQuiet, playerTurnsAfter, quietTurns, renderedVoicesAfter, speechRows, turnsSince } from "./participation";

const chat = [
  { name: "Narrator", mes: "Rain." },
  { name: "Rook", mes: "Hi.", is_user: true },
  { name: "Mara", mes: "Hm." },
  { name: "", mes: "", is_system: true },
  { name: "Rook", mes: "Go.", is_user: true },
  { name: "Finn", mes: "Fine." },
  { name: "Rook", mes: "And?", is_user: true },
  { name: "Narrator", mes: "Wind." },
];
const rows = speechRows(chat);
const member = (name: string) => ({ rosterId: name.toLowerCase(), name, names: [name] });

describe("v3.0 19 stage 2: participation read from the chat", () => {
  it("finds the latest player line and counts player turns", () => {
    expect(latestSend(rows)).toBe(6);
    expect(playerTurnsAfter(rows, 2)).toBe(2);
    expect(renderedVoicesAfter(rows, 4, new Set())).toEqual([5, 7]);
    expect(renderedVoicesAfter(rows, 4, new Set([7]))).toEqual([5]);
  });

  it("quiet turns are player turns since a member last spoke, or since the beat was entered", () => {
    expect(quietTurns(rows, ["Mara"], 0)).toBe(2);
    expect(quietTurns(rows, ["Finn"], 0)).toBe(1);
    expect(quietTurns(rows, ["Ghost"], 0)).toBe(3);
    expect(quietTurns(rows, ["Mara"], 4)).toBe(2);
    expect(turnsSince(rows, 0, (row) => row.text === "Hm.")).toBe(2);
  });

  it("picks the quietest eligible member, a seeded draw between ties, nobody under the threshold", () => {
    expect(pickQuiet(rows, [member("Finn"), member("Mara")], 0, 2)?.name).toBe("Mara");
    expect(pickQuiet(rows, [member("Finn")], 0, 2)).toBeNull();
    expect(pickQuiet(rows, [member("Ghost"), member("Shade")], 0, 1, () => 0.99)?.name).toBe("Shade");
    expect(pickQuiet(rows, [member("Ghost"), member("Shade")], 0, 1, () => 0.01)?.name).toBe("Ghost");
  });
});
