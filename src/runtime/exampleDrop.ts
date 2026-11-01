export interface ExampleDropInput {
  member: string;
  cardExamples: string | null;
  kept: string;
  behavior: "normal" | "keep" | "strip";
}

const hasExamples = (text: string | null): boolean => text !== null && text.replace(/<START>/gi, "").trim().length > 0;

// Dropped = the card has example dialogue, examples are neither pinned nor stripped on purpose, and none of it reached this
// prompt. A shallow card (no mes_example loaded) says nothing either way.
export const examplesDropped = (input: ExampleDropInput): boolean | null => {
  if (!hasExamples(input.cardExamples) || input.behavior !== "normal") return null;
  return input.kept.trim().length === 0;
};

export class ExampleDropLedger {
  private chat: string | null = null;
  private rows = new Map<string, boolean>();

  note(chatId: string, input: ExampleDropInput): boolean {
    if (this.chat !== chatId) {
      this.chat = chatId;
      this.rows = new Map();
    }
    const dropped = examplesDropped(input);
    const before = this.rows.get(input.member);
    if (dropped === null) this.rows.delete(input.member);
    else this.rows.set(input.member, dropped);
    return before !== (dropped ?? undefined);
  }

  view(chatId: string | null): string[] {
    if (chatId === null || this.chat !== chatId) return [];
    return [...this.rows].filter(([, dropped]) => dropped).map(([member]) => member).sort((left, right) => left.localeCompare(right));
  }
}

export const exampleDropLedger = new ExampleDropLedger();

export const exampleDropView = (chatId: string | null): string[] | undefined => {
  const members = exampleDropLedger.view(chatId);
  return members.length ? members : undefined;
};
