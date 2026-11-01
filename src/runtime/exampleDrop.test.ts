import { CHECKS, runCheck } from "./checks";
import { ExampleDropLedger, examplesDropped, type ExampleDropInput } from "./exampleDrop";
import { startExampleDrop } from "./exampleDropHost";
import type { RuntimeSnapshot } from "./types";

jest.mock("@services/STAPI", () => ({ observeExampleDialogue: () => () => undefined }));

const read = (patch: Partial<ExampleDropInput> = {}): ExampleDropInput => ({ member: "Arin", cardExamples: "<START>\n{{char}}: Hm.", kept: "", behavior: "normal", ...patch });

describe("example dialogue pushed out (v3.0 43 L3)", () => {
  it("is dropped only when the card has examples, pin and strip are off, and none reached the prompt", () => {
    expect(examplesDropped(read())).toBe(true);
    expect(examplesDropped(read({ kept: "<START>\nArin: Hm." }))).toBe(false);
    expect(examplesDropped(read({ behavior: "keep" }))).toBeNull();
    expect(examplesDropped(read({ behavior: "strip" }))).toBeNull();
    expect(examplesDropped(read({ cardExamples: "<START>\n" }))).toBeNull();
    expect(examplesDropped(read({ cardExamples: null }))).toBeNull();
  });

  it("keeps the last word per member, per chat, and forgets another chat's rows", () => {
    const ledger = new ExampleDropLedger();
    expect(ledger.note("c1", read())).toBe(true);
    expect(ledger.note("c1", read())).toBe(false);
    ledger.note("c1", read({ member: "Belle" }));
    expect(ledger.view("c1")).toEqual(["Arin", "Belle"]);
    ledger.note("c1", read({ kept: "Arin: Hm." }));
    expect(ledger.view("c1")).toEqual(["Belle"]);
    expect(ledger.view("c2")).toEqual([]);
    ledger.note("c2", read());
    expect(ledger.view("c1")).toEqual([]);
  });

  it("notes only loud prompts in the story's own chat", () => {
    const ledger = new ExampleDropLedger();
    let handler: (input: ExampleDropInput) => void = () => undefined;
    const state = { chat: "c1", loud: true, playing: true };
    let notified = 0;
    startExampleDrop({
      chatId: () => state.chat, ownedChat: () => "c1", playing: () => state.playing, loud: () => state.loud, notify: () => { notified += 1; },
      observe: (next) => { handler = next; return () => undefined; }, ledger,
    });
    state.loud = false;
    handler(read());
    state.loud = true;
    state.chat = "c2";
    handler(read());
    expect(ledger.view("c2")).toEqual([]);
    state.chat = "c1";
    handler(read());
    expect(ledger.view("c1")).toEqual(["Arin"]);
    expect(notified).toBe(1);
  });

  it("the Repair check fires for the dropped members and stays quiet without them", () => {
    const check = CHECKS.find((entry) => entry.id === "voice-examples-pushed-out");
    expect(check?.audience).toBe("author");
    const base = { storyId: "s", ui: { authorView: true } };
    expect(check && runCheck(check, { ...base, exampleDrops: ["Arin"] } as unknown as RuntimeSnapshot)?.detail).toContain("Arin");
    expect(check && runCheck(check, base as unknown as RuntimeSnapshot)).toBeNull();
  });
});
