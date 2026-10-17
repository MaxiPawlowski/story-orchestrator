const mockHost = {
  open: "chat-a",
  metadata: { "chat-a": {}, "chat-b": {} } as Record<string, Record<string, unknown>>,
  personas: {} as Record<string, string>,
  userAvatar: "max.png",
  createSelects: false,
  onLoad: () => undefined as void,
};

const mockModule = {
  get user_avatar() { return mockHost.userAvatar; },
  setUserAvatar: jest.fn(async (avatarId: string) => { mockHost.userAvatar = avatarId; }),
  setPersonaLockState: jest.fn(async () => { mockHost.metadata[mockHost.open].persona = mockHost.userAvatar; }),
};

jest.mock("./personas", () => ({
  loadPersonasModule: async () => { mockHost.onLoad(); return mockModule; },
  personaCrudAvailable: () => true,
}));
jest.mock("./context", () => ({
  getContext: () => ({
    chatMetadata: mockHost.metadata[mockHost.open],
    powerUserSettings: { personas: mockHost.personas },
    executeSlashCommandsWithOptions: async () => {
      mockHost.personas["rook.png"] = "Rook";
      if (mockHost.createSelects) mockHost.userAvatar = "rook.png";
      return { pipe: "rook.png", isError: false };
    },
  }),
}));

import { createPersona, lockPersonaToChat, selectPersona } from "./personaWrites";

const owns = () => mockHost.open === "chat-a";
const input = { name: "Rook", description: "", title: "Story: X" };

beforeEach(() => {
  mockHost.open = "chat-a";
  mockHost.metadata = { "chat-a": {}, "chat-b": {} };
  mockHost.personas = { "max.png": "Max", "mara.png": "Mara" };
  mockHost.userAvatar = "max.png";
  mockHost.createSelects = false;
  mockHost.onLoad = () => undefined;
  jest.clearAllMocks();
});

describe("plan 69 K15: a persona write never leaves a different active persona than before", () => {
  it("create: a host that selects the new persona despite select=false is switched back", async () => {
    mockHost.createSelects = true;
    expect(await createPersona(input, owns)).toEqual({ ok: true, avatarId: "rook.png" });
    expect(mockHost.userAvatar).toBe("max.png");
  });

  it("create: a host that honours select=false needs no switch", async () => {
    expect(await createPersona(input, owns)).toEqual({ ok: true, avatarId: "rook.png" });
    expect(mockHost.userAvatar).toBe("max.png");
    expect(mockModule.setUserAvatar).not.toHaveBeenCalled();
  });

  it("create: when the chat changes during the create, the switch back is not made and the write is refused", async () => {
    mockHost.createSelects = true;
    mockHost.onLoad = () => undefined;
    const result = createPersona(input, () => mockHost.open === "chat-a" && !mockHost.personas["rook.png"]);
    expect((await result).ok).toBe(false);
    expect(mockModule.setUserAvatar).not.toHaveBeenCalled();
  });

  it("lock: the active persona is unchanged", async () => {
    expect((await lockPersonaToChat(owns)).ok).toBe(true);
    expect(mockHost.userAvatar).toBe("max.png");
  });

  it("select of a persona not in the list: the active persona is unchanged", async () => {
    expect((await selectPersona("ghost.png", owns)).ok).toBe(false);
    expect(mockHost.userAvatar).toBe("max.png");
  });

  it("select lapsing while personas.js loads: the active persona is unchanged", async () => {
    mockHost.onLoad = () => { mockHost.open = "chat-b"; };
    expect((await selectPersona("mara.png", owns)).ok).toBe(false);
    expect(mockHost.userAvatar).toBe("max.png");
  });

  it("the start step's order (create, select, lock) leaves the created persona locked to the chat", async () => {
    mockHost.createSelects = true;
    const made = await createPersona(input, owns);
    expect(made.ok).toBe(true);
    expect((await selectPersona("rook.png", owns)).ok).toBe(true);
    expect((await lockPersonaToChat(owns)).ok).toBe(true);
    expect(mockHost.userAvatar).toBe("rook.png");
    expect(mockHost.metadata["chat-a"]).toEqual({ persona: "rook.png" });
  });
});
