import { contextOverServer, readReplyContextWith, replyContextNow } from "./replyContext";

describe("v2.8 F20: the reply connection's context against its server", () => {
  it("flags a context larger than the server serves, and nothing else", () => {
    expect(contextOverServer({ maxContext: 98304, served: 32768, url: "u" })).toEqual({ set: 98304, served: 32768, url: "u" });
    expect(contextOverServer({ maxContext: 32768, served: 32768, url: "u" })).toBeNull();
    expect(contextOverServer({ maxContext: 98304, served: null, url: "u" })).toBeNull();
    expect(contextOverServer(null)).toBeNull();
  });

  it("reads through the injected reader and forgets it on dispose", () => {
    const read = () => ({ set: 2, served: 1, url: "u" });
    const dispose = readReplyContextWith(read);
    expect(replyContextNow()).toEqual({ set: 2, served: 1, url: "u" });
    dispose();
    expect(replyContextNow()).toBeNull();
  });
});
