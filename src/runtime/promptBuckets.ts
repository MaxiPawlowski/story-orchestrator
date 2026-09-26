import type { PromptBucketsRead } from "@services/STAPI";

export interface PromptBucketGroup {
  id: "main" | "character" | "worldInfo" | "chatHistory" | "other";
  label: string;
  tokens: number;
}

export interface PromptBucketView {
  groups: PromptBucketGroup[];
  identifiers: Record<string, number>;
  total: number;
  sum: number;
  matches: boolean;
  chatHistory: number;
  ours: number | null;
  oursExceedsHistory: boolean;
}

export type PromptBucketState = PromptBucketView | { unavailable: string; quiet: boolean } | null;

const GROUP_OF: Record<string, PromptBucketGroup["id"]> = {
  main: "main", nsfw: "main", jailbreak: "main",
  charDescription: "character", charPersonality: "character", scenario: "character", personaDescription: "character", dialogueExamples: "character", enhanceDefinitions: "character",
  worldInfoBefore: "worldInfo", worldInfoAfter: "worldInfo",
  chatHistory: "chatHistory",
};

const GROUPS: Array<Omit<PromptBucketGroup, "tokens">> = [
  { id: "main", label: "main" },
  { id: "character", label: "character" },
  { id: "worldInfo", label: "world info" },
  { id: "chatHistory", label: "chat history" },
  { id: "other", label: "other" },
];

export function bucketView(counts: Record<string, number>, total: number, ours: number | null): PromptBucketView {
  const tokens = new Map<PromptBucketGroup["id"], number>();
  for (const [identifier, count] of Object.entries(counts)) {
    const group = GROUP_OF[identifier] ?? "other";
    tokens.set(group, (tokens.get(group) ?? 0) + count);
  }
  const groups = GROUPS.filter((group) => (tokens.get(group.id) ?? 0) > 0).map((group) => ({ ...group, tokens: tokens.get(group.id) ?? 0 }));
  const sum = Object.values(counts).reduce((left, right) => left + right, 0);
  const chatHistory = counts.chatHistory ?? 0;
  return { groups, identifiers: { ...counts }, total, sum, matches: sum === total, chatHistory, ours, oursExceedsHistory: ours !== null && ours > chatHistory };
}

export function promptBucketsText(view: PromptBucketView): string {
  const parts = view.groups.map((group) => group.id === "chatHistory" && view.ours !== null
    ? `${group.label} ${group.tokens} (of which Story Orchestrator ${view.ours})`
    : `${group.label} ${group.tokens}`);
  const tail = view.matches ? `of ${view.total}` : `adds up to ${view.sum}, ST reports ${view.total}`;
  return `Prompt: ${[...parts, tail].join(" · ")}`;
}

export interface PromptBucketsHost {
  read(): PromptBucketsRead;
  notify(): void;
}

export class PromptBuckets {
  private host: PromptBucketsHost | null = null;
  private last: PromptBucketsRead | null = null;

  attach(host: PromptBucketsHost): () => void {
    this.host = host;
    return () => {
      if (this.host !== host) return;
      this.host = null;
      this.last = null;
    };
  }

  refresh(): void {
    const host = this.host;
    if (!host) return;
    const next = host.read();
    if (next.ok || !this.last?.ok || next.notChatCompletion) this.last = next;
    host.notify();
  }

  view(ours: number | null): PromptBucketState {
    if (!this.host || !this.last) return null;
    return this.last.ok ? bucketView(this.last.counts, this.last.total, ours) : { unavailable: this.last.reason, quiet: Boolean(this.last.notChatCompletion) };
  }
}

export const promptBuckets = new PromptBuckets();
