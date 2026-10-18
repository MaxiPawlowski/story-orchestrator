import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryOrThrow, type NormalizedStory } from "@engine/index";
import { EPISTEMIC_INJECTION_KEY } from "@constants/defaults";
import type { EpistemicEntry } from "@memory/index";
import type { SharedReadAudit } from "@extraction/index";
import { windowOf } from "@extraction/chatRows";
import type { PromisesState } from "@memory/promises/types";
import { MemoryInjector } from "./memoryInjector";
import { createPromisePort, installPromisePortImpl } from "./promisePort";
import { PROMISE_PORT_IMPL } from "./promisePortImpl";
import { promisesSlice } from "./promiseSnapshot";
import type { MemoryRuntimeState, RuntimeExtras } from "./types";
import type { InjectorHosts } from "./hostPorts";

installPromisePortImpl(PROMISE_PORT_IMPL);

const STORY: NormalizedStory = parseStoryOrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")));
const CAST = ["Arin", "DM Narrator"];
const PROMISE = "Arin, I promise I'll pay your debt to the smuggler.";

const raw = (name: string, mes: string, isUser = false) => ({ name, mes, is_user: isUser, is_system: false, extra: {} });

const line = (text: string): string => text;

const hiding = (content: string): EpistemicEntry => ({
  id: "e1", subject: "DM Narrator", tag: "hiding", hiddenFrom: "Arin", content, createdAt: 1, messageId: 1,
  provenance: { source: "extractor", messageId: 1, boundary: 1, pass: "epistemic", validity: "live" },
} as unknown as EpistemicEntry);

function harness(options: { chat?: unknown[]; enabled?: boolean; epistemic?: EpistemicEntry[] } = {}) {
  const chat = options.chat ?? [raw("Arin", "Will you help me with the smuggler?"), raw("Rin", PROMISE, true), raw("Arin", "Thank you."), raw("Rin", "The smuggler and that debt are close now.", true)];
  const memory = {
    settings: { enabled: true, epistemicLedgerCapable: true, promises: options.enabled !== false, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 },
      tierTokenBudgets: { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 } },
    entries: [], epistemic: options.epistemic ?? [], ledger: [], arcs: [], derived: [], pinnedOverflow: 0,
  } as unknown as MemoryRuntimeState;
  const extras = { memory } as unknown as RuntimeExtras;
  const journal: string[] = [];
  const blocks = new Map<string, string>();
  const state = { boundary: 5, lastMessageId: chat.length - 1, activeCheckpointId: "start", blackboard: { values: {}, versions: {} } };
  const port = createPromisePort({
    getStory: () => STORY, getState: () => state as never, extras: () => extras, chatId: () => "chat-1", storyId: () => "life",
    chatWindow: (from, to) => windowOf(chat, from, to), chatRows: () => chat, historyFloor: () => 0, playerName: () => "Rin",
    journal: (summary, note) => journal.push(`${summary}\n${note}`), refresh: () => undefined,
  });
  const hosts = {
    prompt: { setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); }, clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); } },
    roster: { getActiveGroup: () => ({ id: "g", members: [], disabled_members: [] }), resolveGroupMemberId: (name: string) => `${name}.png`, chatRows: () => [], systemUserName: "SillyTavern System" },
    chat: { chatRows: () => chat, lastMessageText: () => "", chatWindow: () => ({ messages: [] }) },
    injection: { getCharacterNameById: (index: number) => CAST[index], readInjectedPromptBlocks: () => [] },
  } as unknown as InjectorHosts;
  const injector = new MemoryInjector({
    getStory: () => STORY, getState: () => state as never, memory: () => memory, enabled: () => true, capable: () => true, ledgerBindings: () => [],
    setPinnedOverflow: () => undefined, beatFor: () => "", hosts: () => hosts,
  });
  injector.addPrivateSource((rosterId) => port.reminder(rosterId));
  const audit = (lines: string[], window = { from: 0, to: chat.length - 1 }) => ({ window, rejected: [], promiseLines: lines } as unknown as SharedReadAudit);
  const draft = (name: string) => { injector.update(); injector.onMemberDrafted(CAST.indexOf(name)); return blocks.get(EPISTEMIC_INJECTION_KEY) ?? ""; };
  const resting = () => { injector.update(); return blocks.get(EPISTEMIC_INJECTION_KEY) ?? ""; };
  return { port, extras, journal, audit, draft, resting };
}

describe("plan 47 runtime: the promise port writes its own slice from a read's lines", () => {
  it("accepts a resolved promise, journals refusals, and offers it to the next read by id", () => {
    const h = harness();
    const audit = h.audit([line(`[promised] Arin | m=1 | "${PROMISE}"`), line('[promised] Arin | m=2 | "Thank you."'), line('[kept] p1 | "done"')]);
    expect(h.port.apply(audit, [])).toEqual([]);
    expect(h.extras.promises?.rows).toHaveLength(1);
    expect(h.journal[0]).toContain("not the player's own words");
    expect(h.journal[0]).toContain("promise line without m=<message index>");
    expect(audit.rejected).toEqual([{ line: '[kept] p1 | "done"', reason: "promise line without m=<message index>" }]);
    expect(h.port.open()).toEqual([{ id: h.extras.promises?.rows[0]?.id, promisee: "Arin", quote: PROMISE }]);
  });

  it("drops an arc that restates an open promise, counted on the audit (P4a)", () => {
    const h = harness();
    h.port.apply(h.audit([line(`[promised] Arin | m=1 | "${PROMISE}"`)]), []);
    const audit = h.audit([]);
    const kept = h.port.apply(audit, [{ kind: "open", text: "Rin promised to pay Arin's debt to the smuggler" }, { kind: "open", text: "The baron's census" }]);
    expect(kept).toEqual([{ kind: "open", text: "The baron's census" }]);
    expect(audit.rejected).toEqual([{ line: "[arc] Rin promised to pay Arin's debt to the smuggler", reason: "restates a promise" }]);
  });

  it("is silent when switched off: no contract section, no rows, no reminder", () => {
    const h = harness({ enabled: false });
    expect(h.port.open()).toBeNull();
    h.port.apply(h.audit([line(`[promised] Arin | m=1 | "${PROMISE}"`)]), []);
    expect(h.extras.promises).toBeUndefined();
    expect(h.draft("Arin")).not.toContain("promised you");
  });
});

describe("plan 47 P4: the reminder reaches only the promisee's drafted request", () => {
  it("never in the resting block or another member's block", () => {
    const h = harness();
    h.port.apply(h.audit([line(`[promised] Arin | m=1 | "${PROMISE}"`)]), []);
    expect(h.draft("Arin")).toContain(`Rin promised you: "${PROMISE}". You may bring it up if it fits.`);
    expect(h.draft("DM Narrator")).not.toContain("promised");
    expect(h.resting()).not.toContain("promised");
  });

  it("goes through the held-secret filter of the promisee's block", () => {
    const h = harness({ epistemic: [hiding("pay your debt to the smuggler")] });
    h.port.apply(h.audit([line(`[promised] Arin | m=1 | "${PROMISE}"`)]), []);
    expect(h.draft("Arin")).not.toContain("pay your debt to the smuggler");
  });
});

describe("plan 47 P5: the player's list is the same with and without held secrets", () => {
  it("shows verified quotes only, identical either way", () => {
    const plain = harness();
    plain.port.apply(plain.audit([line(`[promised] Arin | m=1 | "${PROMISE}"`)]), []);
    const secret = harness({ epistemic: [hiding("pay your debt to the smuggler")] });
    secret.port.apply(secret.audit([line(`[promised] Arin | m=1 | "${PROMISE}"`)]), []);
    const view = (extras: RuntimeExtras) => promisesSlice(STORY, extras, {});
    expect(view(plain.extras)).toEqual([{ id: expect.stringMatching(/^p/), promisee: "Arin", quote: PROMISE }]);
    expect(view(secret.extras)).toEqual(view(plain.extras));
    expect(promisesSlice(STORY, { memory: plain.extras.memory, promises: { rows: [] } as PromisesState }, {})).toEqual([]);
  });
});
