import { findNumbers, findStringCandidates } from "./numbers";

const values = (text: string) => findNumbers([{ id: "msg_1", text }]).map((mention) => Math.round(mention.value * 1000) / 1000);

describe("numbers (v2.2 plan 06)", () => {
  it("reads digits, word numbers and hyphenated tens", () => {
    expect(values("The reward is 500 crowns, not two hundred.")).toEqual(expect.arrayContaining([500, 2]));
    expect(values("Luke is twelve; Arin is twenty-four.")).toEqual([12, 24]);
  });

  it("reads 'point' decimals, fractions and percentages", () => {
    expect(values("Trust is at zero point six now.")).toEqual([0.6]);
    expect(values("Two-thirds of the guard left; a quarter stayed.")).toEqual([0.667, 0.25]);
    expect(values("Morale fell to 40% and then 55 percent.")).toEqual([0.4, 0.55]);
  });

  it("reads Spanish words, 'y' tens, 'coma' decimals and 'por ciento'", () => {
    expect(values("Faltan treinta y dos monedas.")).toEqual([32]);
    expect(values("La confianza es cero coma seis.")).toEqual([0.6]);
    expect(values("Queda un 15 por ciento de la guardia.")).toEqual([0.15]);
    expect(values("Luke tiene doce años.")).toEqual([12]);
  });

  it("never reads one span twice, and keeps the message id and a snippet", () => {
    const [mention] = findNumbers([{ id: "msg_7", text: "It costs 40% more." }]);
    expect(mention).toEqual({ raw: "40%", value: 0.4, messageId: "msg_7", snippet: "It costs 40% more." });
  });

  it("finds quoted and capitalised string candidates once each, Spanish accents included", () => {
    const found = findStringCandidates([{ id: "msg_1", text: "She whispers \"moon\" to the Sphinx. The Sphinx waits. Ángela nods." }]);
    expect(found.map((candidate) => candidate.raw)).toEqual(["moon", "She", "Sphinx", "The", "Ángela"]);
  });
});
