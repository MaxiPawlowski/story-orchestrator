import { buildScoreContext } from "./scoreContext";

const chatRef = { current: [] as unknown[] };

jest.mock("@services/STAPI", () => ({ getContext: () => ({ chat: chatRef.current }) }));

describe("v2.4 plan 04 T7: the memory scorer reads the cleaned turn", () => {
  it("takes the newest kept message, skipping an in-flight reply and a foreign post", () => {
    chatRef.current = [
      { name: "Max", is_user: true, mes: "I ask <i>Mara</i> about the vault." },
      { name: "CYOA Suggestions", is_user: true, mes: "<button>1. Ask Corin instead</button>", extra: { model: "cyoa" } },
      { name: "Corin", is_user: false, mes: "Corin interrupts", gen_started: "t0" },
    ];
    const context = buildScoreContext({ boundary: 3, rosterNames: ["Mara", "Corin"], openArcs: [] });
    expect(context.turnText).toBe("I ask Mara about the vault.");
    expect(context.turnEntities).toEqual(["Mara"]);
    expect(context.lastMessageId).toBe(2);
  });
});
