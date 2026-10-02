import { lastPlayerMessageAt } from "./playerTurn";

describe("T2-1: the boundary context names the newest player message at or before the boundary", () => {
  const chat = [{ is_user: false }, { is_user: true }, { is_user: false }, { is_user: true, is_system: true }, { is_user: false }, { is_user: true }];

  it("skips member replies and hidden system rows, and never reads past the boundary", () => {
    expect(lastPlayerMessageAt(chat, 4)).toEqual({ lastPlayerMessageId: 1 });
    expect(lastPlayerMessageAt(chat, 5)).toEqual({ lastPlayerMessageId: 5 });
  });

  it("a chat with no player line says nothing, so nothing is held", () => {
    expect(lastPlayerMessageAt([{ is_user: false }, null], 1)).toEqual({});
  });
});
