import { cardReadBack, describeReadBack, type SentCard } from "./cardReadBack";

const SENT: SentCard = { name: "Ilsa Crane", description: "Buys anything.\nSells less.", personality: "shrewd", scenario: "", first_mes: "", mes_example: "" };

describe("v2.8 09 harvest: card read-back (POST /api/characters/get, src/endpoints/characters.js:1480)", () => {
  it("stored when every sent field reads back the same (line endings aside)", () => {
    expect(cardReadBack(SENT, { ok: true, body: { ...SENT, description: "Buys anything.\r\nSells less." } })).toEqual({ state: "stored", lossy: [], name: "Ilsa Crane" });
    expect(cardReadBack(SENT, { ok: true, body: { name: "Ilsa Crane", data: { ...SENT } } })).toMatchObject({ state: "stored" });
  });

  it("mismatch names each field stored differently", () => {
    expect(cardReadBack(SENT, { ok: true, body: { ...SENT, name: "Ilsa Crane_", personality: "" } })).toEqual({ state: "mismatch", lossy: ["name", "personality"], name: "Ilsa Crane_" });
  });

  it("unconfirmed on a failed request, a 404, or a card the server could not parse (200 without a name, :432)", () => {
    expect(cardReadBack(SENT, null).state).toBe("unconfirmed");
    expect(cardReadBack(SENT, { ok: false, body: null }).state).toBe("unconfirmed");
    expect(cardReadBack(SENT, { ok: true, body: { date_added: 0, chat_size: 0 } }).state).toBe("unconfirmed");
  });

  it("the author-facing line says may exist for unconfirmed and never offers to create it again", () => {
    expect(describeReadBack("Ilsa Crane", { state: "unconfirmed", lossy: [] })).toContain("may exist");
    expect(describeReadBack("Ilsa Crane", { state: "mismatch", lossy: ["name"] })).toContain("never created again");
  });
});
