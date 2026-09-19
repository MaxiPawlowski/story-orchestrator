const executeSlashCommands = jest.fn(async (_command: string) => true);

jest.mock("./slashCommands", () => ({
  executeSlashCommands: (command: string) => executeSlashCommands(command),
}));

import { applyCharacterAN, clearCharacterAN } from "./authorNotes";

const commands = () => executeSlashCommands.mock.calls.map(([command]) => command);

const field = { value: "", dispatchEvent: jest.fn((_event: Event) => true) };
const querySelector = jest.fn((_selector: string): typeof field | null => field);
const originalDocument = globalThis.document;

beforeAll(() => {
  Object.defineProperty(globalThis, "document", { value: { querySelector }, configurable: true });
});

afterAll(() => {
  Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true });
});

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  executeSlashCommands.mockReset();
  executeSlashCommands.mockImplementation(async () => true);
  querySelector.mockClear();
  field.dispatchEvent.mockClear();
  field.value = "old checkpoint note";
});

const expectFieldCleared = () => {
  expect(querySelector).toHaveBeenCalledWith("#extension_floating_prompt");
  expect(field.value).toBe("");
  expect(field.dispatchEvent).toHaveBeenCalledTimes(1);
  const [event] = field.dispatchEvent.mock.calls[0];
  expect(event.type).toBe("input");
  expect(event.bubbles).toBe(true);
};

describe("applyCharacterAN", () => {
  it("sets the authored role before the note text", async () => {
    await applyCharacterAN("Stay quiet.", { position: "chat", depth: 2, interval: 3, role: "user" });
    expect(commands()).toEqual([
      "/note-position chat",
      "/note-role user",
      "/note-depth 2",
      "/note-frequency 3",
      '/note "Stay quiet."',
    ]);
    expect(field.dispatchEvent).not.toHaveBeenCalled();
  });

  it("writes pipes, real line breaks and macro braces into the note unchanged", async () => {
    await applyCharacterAN('Scene | beat\nKeep "{{char}}" \\ calm.');
    expect(commands().at(-1)).toBe('/note "Scene | beat\nKeep \\"\\{\\{char\\}\\}\\" \\ calm."');
  });

  it("passes assistant through unchanged", async () => {
    await applyCharacterAN("Narrate.", { role: "assistant" });
    expect(commands()).toContain("/note-role assistant");
  });

  it("resets to system when no role is authored, so a previous checkpoint's role does not leak", async () => {
    await applyCharacterAN("Narrate.");
    expect(commands()).toEqual([
      "/note-position chat",
      "/note-role system",
      "/note-depth 4",
      "/note-frequency 1",
      '/note "Narrate."',
    ]);
  });

  it("empties the note field when the new text cannot be written, so the previous note does not linger", async () => {
    executeSlashCommands.mockImplementation(async (command: string) => !command.startsWith("/note "));
    await applyCharacterAN("Broken {{text");
    expectFieldCleared();
    expect(commands().filter((command) => command.startsWith("/note "))).toEqual(['/note "Broken \\{\\{text"']);
  });
});

describe("clearCharacterAN", () => {
  it("empties the note text through the field's input path, returns the role to system and disables the note", async () => {
    await clearCharacterAN();
    expectFieldCleared();
    expect(commands()).toEqual(["/note-role system", "/note-frequency 0"]);
  });

  it("still disables the note when the field is missing", async () => {
    querySelector.mockReturnValueOnce(null);
    await clearCharacterAN();
    expect(field.value).toBe("old checkpoint note");
    expect(console.warn).toHaveBeenCalled();
    expect(commands()).toEqual(["/note-role system", "/note-frequency 0"]);
  });
});
