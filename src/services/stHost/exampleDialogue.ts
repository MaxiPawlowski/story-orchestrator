import { getContext } from "./context";
import { log } from "@utils/log";

type Listener = (...args: unknown[]) => unknown;

interface CombineSource {
  on: (event: string, listener: Listener) => unknown;
  off?: (event: string, listener: Listener) => unknown;
  removeListener?: (event: string, listener: Listener) => unknown;
}

export type ExampleBehavior = "normal" | "keep" | "strip";

export interface ExampleDialogueRead {
  member: string;
  cardExamples: string | null;
  kept: string;
  behavior: ExampleBehavior;
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

// Power-user.js:1541-1551: strip_examples wins, then pin_examples ("Always include examples"); otherwise examples are
// added after the chat history only while they fit (script.js:4957-4969).
const behaviorOf = (settings: { pin_examples?: unknown; strip_examples?: unknown } | undefined): ExampleBehavior =>
  (settings?.strip_examples === true ? "strip" : settings?.pin_examples === true ? "keep" : "normal");

// Read-only: script.js:5194-5243 emits GENERATE_BEFORE_COMBINE_PROMPTS for Text Completion prompts with `char` (name2) and
// `mesExmString`, the example dialogue that made it into this prompt. Chat Completion builds its prompt elsewhere and is not read.
export function observeExampleDialogue(handler: (read: ExampleDialogueRead) => void): () => void {
  const context = getContext();
  const source = context.eventSource as unknown as CombineSource | undefined;
  const event = context.eventTypes?.GENERATE_BEFORE_COMBINE_PROMPTS;
  if (!source || !event) return () => undefined;
  const listener: Listener = (data) => {
    try {
      if (!data || typeof data !== "object") return;
      const row = data as { char?: unknown; mesExmString?: unknown; api?: unknown };
      const member = text(row.char)?.trim();
      if (!member || row.api === "openai") return;
      const host = getContext();
      const card = (host.characters ?? []).find((character) => character?.name === member);
      const settings = (host as unknown as { powerUserSettings?: { pin_examples?: unknown; strip_examples?: unknown } }).powerUserSettings;
      handler({ member, cardExamples: text(card?.mes_example), kept: text(row.mesExmString) ?? "", behavior: behaviorOf(settings) });
    } catch (error) {
      log.warn("the example dialogue observer failed", error);
    }
  };
  source.on(event, listener);
  return () => {
    if (typeof source.off === "function") source.off(event, listener);
    else source.removeListener?.(event, listener);
  };
}
