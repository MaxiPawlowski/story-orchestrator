import { captureFingerprints } from "./fingerprints";
import { fingerprintAt, jumpIndex, jumpLabel, jumpTarget } from "./messageJump";

const chat = () => [
  { mes: "greeting", is_user: false, name: "Arin" },
  { mes: "I light the lantern.", is_user: true, name: "You" },
  { mes: "The tunnel opens.", is_user: false, name: "Arin" },
  { mes: "We go down.", is_user: true, name: "You" },
];

describe("message jump target (v2.4 plan 08 T19d, D12)", () => {
  it("refuses a legacy -1 and a non-finite id", () => {
    expect(jumpTarget(-1, 4)).toMatchObject({ ok: false });
    expect(jumpTarget(Number.NaN, 4)).toMatchObject({ ok: false });
  });

  it("refuses an id the chat no longer holds", () => {
    expect(jumpTarget(4, 4)).toEqual({ ok: false, reason: "message 4 is past the end of this chat (4 messages)" });
  });

  it("jumps to a message whose fingerprint still matches, with no warning", () => {
    const messages = chat();
    const index = jumpIndex(messages, captureFingerprints(null, messages, -1, 3));
    expect(jumpTarget(2, index.chatLength, fingerprintAt(index, 2))).toEqual({ ok: true, id: 2, changed: false, bestEffort: false });
    expect(jumpLabel(2, fingerprintAt(index, 2))).toBe("message 2");
  });

  it("warns when the cited message was rewritten since the boundary that recorded it, and still jumps", () => {
    const messages = chat();
    const stored = captureFingerprints(null, messages, -1, 3);
    messages[2] = { ...messages[2], mes: "The tunnel collapses." };
    const index = jumpIndex(messages, stored);
    expect(index.changed).toEqual([2]);
    expect(jumpTarget(2, index.chatLength, fingerprintAt(index, 2))).toEqual({ ok: true, id: 2, changed: true, bestEffort: false });
    expect(jumpLabel(2, fingerprintAt(index, 2))).toBe("message 2 (changed since)");
  });

  it("does not call a hidden message changed, because hiding is not deleting (D5)", () => {
    const messages = chat();
    const stored = captureFingerprints(null, messages, -1, 3);
    messages[1] = { ...messages[1], is_system: true } as (typeof messages)[number];
    expect(jumpIndex(messages, stored).changed).toEqual([]);
    expect(fingerprintAt(jumpIndex(messages, stored), 1)).toBe("same");
  });

  it("labels a message no boundary fingerprinted as best-effort, never as changed", () => {
    const messages = chat();
    const index = jumpIndex(messages, null);
    expect(fingerprintAt(index, 2)).toBe("unknown");
    expect(jumpTarget(2, index.chatLength, "unknown")).toEqual({ ok: true, id: 2, changed: false, bestEffort: true });
    expect(jumpLabel(2, "unknown")).toBe("message 2 (best-effort)");
    const partial = jumpIndex(messages, captureFingerprints(null, messages, 1, 2));
    expect(fingerprintAt(partial, 0)).toBe("unknown");
    expect(fingerprintAt(partial, 3)).toBe("unknown");
    expect(fingerprintAt(null, 2)).toBe("unknown");
  });
});
