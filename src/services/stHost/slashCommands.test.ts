const executeSlashCommandsWithOptions = jest.fn(async (_command: string, _options?: unknown): Promise<{ isError?: boolean; errorMessage?: string } | undefined> => ({ isError: false }));

jest.mock("./context", () => ({
  getContext: () => ({ executeSlashCommandsWithOptions }),
}));

import { executeSlashCommands } from "./slashCommands";

beforeAll(() => {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "window");
});

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  executeSlashCommandsWithOptions.mockReset();
  executeSlashCommandsWithOptions.mockImplementation(async () => ({ isError: false }));
});

describe("executeSlashCommands", () => {
  it("pins strict escaping and getvar rewriting off, whatever the user's STscript settings are", async () => {
    await executeSlashCommands('/note "a | b"');
    expect(executeSlashCommandsWithOptions).toHaveBeenCalledWith('/note "a | b"', {
      handleParserErrors: false,
      handleExecutionErrors: true,
      parserFlags: { 1: true, 2: false },
    });
  });

  it("reports a parser error as a failure instead of ST's toast-and-empty-result", async () => {
    executeSlashCommandsWithOptions.mockImplementation(async () => {
      throw new Error("Unexpected end of quoted value");
    });
    await expect(executeSlashCommands('/note "broken')).resolves.toBe(false);
  });

  it("reports an execution error as a failure", async () => {
    executeSlashCommandsWithOptions.mockImplementation(async () => ({ isError: true, errorMessage: "boom" }));
    await expect(executeSlashCommands("/note x")).resolves.toBe(false);
  });

  it("succeeds when every command succeeds", async () => {
    await expect(executeSlashCommands(["/note-depth 2", "/note x"])).resolves.toBe(true);
    expect(executeSlashCommandsWithOptions).toHaveBeenCalledTimes(2);
  });
});
