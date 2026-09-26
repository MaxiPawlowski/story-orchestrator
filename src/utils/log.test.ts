import { DEBUG_OPT_IN_KEY, debugEnabled, log } from "./log";

const storage = (value: string | null) => ({ getItem: (key: string) => (key === DEBUG_OPT_IN_KEY ? value : null) });

describe("log", () => {
  const env = process.env.NODE_ENV;
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  afterEach(() => {
    process.env.NODE_ENV = env;
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
    jest.restoreAllMocks();
  });

  it("prefixes warn and info with the extension name and passes details through", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const error = new Error("boom");
    log.warn("scene read failed", error);
    log.info("ready");
    expect(warn).toHaveBeenCalledWith("[Story Orchestrator] scene read failed", error);
    expect(info).toHaveBeenCalledWith("[Story Orchestrator] ready");
  });

  it("keeps debug silent in a production build with no stored opt-in", () => {
    process.env.NODE_ENV = "production";
    const debug = jest.spyOn(console, "debug").mockImplementation(() => undefined);
    log.debug("applying");
    expect(debugEnabled()).toBe(false);
    expect(debug).not.toHaveBeenCalled();
  });

  it("turns debug on for a development build", () => {
    process.env.NODE_ENV = "development";
    const debug = jest.spyOn(console, "debug").mockImplementation(() => undefined);
    log.debug("applying", { depth: 4 });
    expect(debug).toHaveBeenCalledWith("[Story Orchestrator] applying", { depth: 4 });
  });

  it("turns debug on only for the exact stored opt-in", () => {
    process.env.NODE_ENV = "production";
    Object.defineProperty(globalThis, "localStorage", { value: storage("on"), configurable: true });
    expect(debugEnabled()).toBe(true);
    Object.defineProperty(globalThis, "localStorage", { value: storage("yes"), configurable: true });
    expect(debugEnabled()).toBe(false);
  });

  it("reads a storage that throws as no opt-in", () => {
    process.env.NODE_ENV = "production";
    Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => { throw new Error("denied"); } }, configurable: true });
    expect(debugEnabled()).toBe(false);
  });
});
