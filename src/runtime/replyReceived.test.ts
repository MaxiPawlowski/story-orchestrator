jest.mock("@services/STAPI", () => ({}));

import { onReplyReceived } from "./replyReceived";

describe("v2.8 69 K17 (plan 60 B7): reply-effort repair reads a host message id, never Number(id)", () => {
  it("a null, empty or non-numeric id never reads as message 0; a numeric string or number passes through", () => {
    const seen: number[] = [];
    const handler = onReplyReceived((id) => seen.push(id));
    [null, undefined, "", "  ", "abc", Number.NaN, {}].forEach((value) => handler(value));
    expect(seen).toEqual([]);
    handler(0);
    handler("7");
    handler(12);
    expect(seen).toEqual([0, 7, 12]);
  });
});
