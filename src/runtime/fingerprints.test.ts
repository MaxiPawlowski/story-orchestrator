import { captureFingerprints, diffFingerprints, fingerprintOf, FingerprintKeeper, hashAt, sanitizeFingerprints, truncateFingerprints, type MessageFingerprints } from "./fingerprints";
import { messageKey } from "./messageIdentity";
import { getChatWindow } from "@extraction/chatWindow";

const mockHost = { chat: [] as unknown[] };
jest.mock("@services/STAPI", () => ({ getContext: () => ({ chat: mockHost.chat }) }));

interface Row { name: string; is_user: boolean; mes: string; is_system?: boolean; swipe_id?: number; send_date?: string }

const row = (index: number, text = `line ${index}`): Row => ({ name: index % 2 ? "Arin" : "Player", is_user: index % 2 === 0, mes: text, send_date: `t${index}` });
const chatOf = (count: number): Row[] => Array.from({ length: count }, (_, index) => row(index));

describe("v2.4 plan 02 T3: what a fingerprint hashes", () => {
  const base = row(1);

  it("ignores swipe_id (H7), is_system (D5) and a user row's name (H8)", () => {
    expect(fingerprintOf({ ...base, swipe_id: 3 })).toBe(fingerprintOf(base));
    expect(fingerprintOf({ ...base, is_system: true })).toBe(fingerprintOf(base));
    const user = row(0);
    expect(fingerprintOf({ ...user, name: "Former Persona" })).toBe(fingerprintOf(user));
  });

  it("reacts to the text, to who spoke, and to a character row's name", () => {
    expect(fingerprintOf({ ...base, mes: "line 1." })).not.toBe(fingerprintOf(base));
    expect(fingerprintOf({ ...base, is_user: true })).not.toBe(fingerprintOf(base));
    expect(fingerprintOf({ ...base, name: "Mara" })).not.toBe(fingerprintOf(base));
  });
});

describe("v2.4 plan 02 T3: the per-message hash cache", () => {
  it("answers a message mutated in place by its new content, never by what it cached", () => {
    const message = row(1);
    const before = fingerprintOf(message);
    message.mes = "changed in place";
    expect(fingerprintOf(message)).not.toBe(before);
    expect(fingerprintOf(message)).toBe(fingerprintOf({ ...message }));
    message.name = "Mara";
    expect(fingerprintOf(message)).toBe(fingerprintOf({ ...message }));
  });
});

describe("v2.4 plan 02 D5: hidden is not deleted", () => {
  it("T1's message key has no is_system either, so a hide never misaligns a delete (X3)", () => {
    const message = row(3);
    expect(messageKey({ ...message, is_system: true })).toBe(messageKey(message));
  });

  it("a hidden consumed message is not a mismatch, and it is out of the next read window", () => {
    const chat = chatOf(3);
    const stored = captureFingerprints(null, chat, -1, 2);
    const hidden = chat.map((message, index) => (index === 1 ? { ...message, is_system: true } : message));
    expect(diffFingerprints(stored, hidden, 2)).toBeNull();
    mockHost.chat = hidden;
    expect(getChatWindow(0, 2).messages.map((message) => message.messageId)).toEqual([0, 2]);
  });

  it("control: the same message with its text changed is a mismatch", () => {
    const chat = chatOf(3);
    const stored = captureFingerprints(null, chat, -1, 2);
    expect(diffFingerprints(stored, chat.map((message, index) => (index === 1 ? { ...message, mes: "rewritten" } : message)), 2)).toBe(1);
  });
});

describe("v2.4 plan 02 T3: capture, diff and truncate", () => {
  it("absent or null is unknown, never a mismatch", () => {
    const chat = chatOf(4);
    expect(diffFingerprints(null, chat, 3)).toBeNull();
    const partial: MessageFingerprints = { v: 1, from: 0, hashes: [null, fingerprintOf(chat[1]), null, null] };
    expect(diffFingerprints(partial, chat.map((message) => ({ ...message, mes: "x" })), 3)).toBe(1);
    expect(diffFingerprints({ v: 1, from: 0, hashes: [null, null, null, null] }, chat.map((message) => ({ ...message, mes: "x" })), 3)).toBeNull();
    expect(sanitizeFingerprints(undefined)).toBeNull();
    expect(sanitizeFingerprints({ v: 2, from: 0, hashes: [] })).toBeNull();
    expect(sanitizeFingerprints({ v: 1, from: 0, hashes: ["a", 7, null] })).toEqual({ v: 1, from: 0, hashes: ["a", null, null] });
  });

  it("a chat shorter than the story's last message is a mismatch at its length, with or without fingerprints", () => {
    const chat = chatOf(5);
    const stored = captureFingerprints(null, chat, -1, 4);
    expect(diffFingerprints(stored, chat.slice(0, 2), 4)).toBe(2);
    expect(diffFingerprints(null, chat.slice(0, 2), 4)).toBe(2);
    expect(diffFingerprints(null, chat, 4)).toBeNull();
  });

  it("the earlier of a changed hash and a short chat wins", () => {
    const chat = chatOf(5);
    const stored = captureFingerprints(null, chat, -1, 4);
    const cut = chat.slice(0, 3).map((message, index) => (index === 1 ? { ...message, mes: "swapped" } : message));
    expect(diffFingerprints(stored, cut, 4)).toBe(1);
  });

  it("keeps a known hash, fills an unknown one from the chat, and covers only (floor, last]", () => {
    const chat = chatOf(6);
    const first = captureFingerprints(null, chat, -1, 2)!;
    expect(first.from).toBe(0);
    expect(first.hashes).toHaveLength(3);
    const rewritten = chat.map((message, index) => (index === 1 ? { ...message, mes: "rewritten" } : message));
    const next = captureFingerprints(first, rewritten, 0, 4)!;
    expect(next.from).toBe(1);
    expect(hashAt(next, 1)).toBe(fingerprintOf(chat[1]));
    expect(hashAt(next, 4)).toBe(fingerprintOf(chat[4]));
    expect(hashAt(next, 5)).toBeNull();
    expect(captureFingerprints(first, chat, 3, 3)).toBeNull();
  });

  it("a message the chat no longer holds stays unknown rather than hashing nothing", () => {
    const next = captureFingerprints(null, chatOf(2), -1, 3)!;
    expect(next.hashes.slice(2)).toEqual([null, null]);
  });

  it("the continue re-hash: forgetting the continued message lets the next capture take its new text", () => {
    const chat = chatOf(3);
    const keeper = new FingerprintKeeper();
    keeper.capture(chat, -1, 2);
    const continued = chat.map((message, index) => (index === 2 ? { ...message, mes: `${message.mes} and more` } : message));
    expect(keeper.drift(continued, 2)).toBe(2);
    keeper.forgetFrom(2);
    expect(keeper.drift(continued, 2)).toBeNull();
    keeper.settle();
    keeper.capture(continued, -1, 2);
    expect(hashAt(keeper.current, 2)).toBe(fingerprintOf(continued[2]));
    expect(keeper.unchanged(continued, 2)).toBe(true);
    expect(keeper.unchanged(chat, 2)).toBe(false);
  });

  it("T4-1: a swipe's in-flight text saved before its reply lands is never read as an eventless change (T4-1-1 msg 2)", () => {
    const recorded = ["The estate's servants scurry out of your path as you stride through the manor's corridors.", "The Nightriver Estate is quiet in a way it rarely is."];
    const chat = chatOf(3).map((message, index) => (index === 2 ? { ...message, name: "Adolion Narrator", mes: recorded[0] } : message));
    const keeper = new FingerprintKeeper();
    keeper.capture(chat, -1, 2);
    keeper.forgetFrom(2);
    chat[2] = { ...chat[2], mes: "..." };
    keeper.capture(chat, -1, 2);
    chat[2] = { ...chat[2], mes: recorded[1] };
    expect(keeper.drift(chat, 2)).toBeNull();
    keeper.settle();
    keeper.capture(chat, -1, 2);
    expect(hashAt(keeper.current, 2)).toBe(fingerprintOf(chat[2]));
    expect(keeper.drift(chat.map((message, index) => (index === 2 ? { ...message, mes: "rewritten" } : message)), 2)).toBe(2);
  });

  it("unchanged is false for a message it never read", () => {
    const keeper = new FingerprintKeeper();
    keeper.capture(chatOf(2), -1, 1);
    expect(keeper.unchanged(chatOf(4), 3)).toBe(false);
  });
});

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

describe("v2.4 plan 02 T3: rollback truncation is what replay holds (inv 11)", () => {
  it.each([7, 23, 101, 4242])("truncating the final fingerprints to a boundary equals replaying the captures up to it (seed %i)", (seed) => {
    const random = rng(seed);
    const chat: Row[] = [];
    let stored: MessageFingerprints | null = null;
    const boundaries: Array<{ last: number; fingerprints: MessageFingerprints | null }> = [];
    for (let step = 0; step < 30; step += 1) {
      const added = 1 + Math.floor(random() * 3);
      for (let index = 0; index < added; index += 1) chat.push(row(chat.length, `m${chat.length}-${Math.floor(random() * 1000)}`));
      stored = captureFingerprints(stored, chat, -1, chat.length - 1);
      boundaries.push({ last: chat.length - 1, fingerprints: stored });
    }
    for (const boundary of boundaries) {
      const restored = truncateFingerprints(stored, boundary.last + 1);
      expect({ at: boundary.last, fingerprints: restored }).toEqual({ at: boundary.last, fingerprints: boundary.fingerprints });
      expect(captureFingerprints(restored, chat, -1, chat.length - 1)).toEqual(stored);
    }
  });
});
