import { maxTokensCap, maxTokensForInput } from "@extraction/callBudget";
import { lapseAsEmpty } from "@extraction/modelError";
import { askReply, type ExtractionReply } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import { buildCanonSummaryPrompt, canonInputHash, resolvedArcs } from "@memory/index";
import { beginRun } from "./runToken";
import type { CanonSource } from "./types";
import { CanonView } from "./canonView";

interface CanonReply {
  text: string;
  cut: string | null;
}

export class CanonSynthesis extends CanonView {
  private inFlight = false;

  private async ask(prompt: string, signal: AbortSignal): Promise<CanonReply> {
    const call = (maxTokens: number): Promise<ExtractionReply> =>
      askReply(this.deps.model(), prompt, { role: "synthesis", pass: "canon", maxTokens, signal, refuseIncomplete: true }).catch((error: unknown) => ({ text: lapseAsEmpty(error), finish: "stop" }));
    const cut = (reply: ExtractionReply) => !reply.text && reply.finish === "length";
    const first = maxTokensForInput("canon", prompt);
    const reply = await call(first);
    if (!cut(reply) || signal.aborted) return { text: reply.text, cut: null };
    const larger = Math.max(first, maxTokensCap("canon"));
    const retry = await call(larger);
    if (!cut(retry)) return { text: retry.text, cut: null };
    return { text: "", cut: `canon reply cut at ${first} tokens, asked again: cut at ${larger} tokens` };
  }

  async regenerateCanon(force = false, draft = false): Promise<boolean> {
    const story = this.deps.getStory();
    const memory = this.deps.memory();
    if (!story || !this.deps.enabled() || this.inFlight) return false;
    if (draft && !this.deps.judge?.()?.active("canonDraft")) return false;
    const arcSummaries = resolvedArcs(memory.arcs).filter((arc) => !arc.foldedInto).map((arc) => (arc.summary ? this.deps.restingLines(arc.summary) : "")).filter(Boolean);
    if (!arcSummaries.length) return false;
    const facts = this.canonFacts(memory).map((entry) => entry.text);
    const active = story.checkpointById[this.deps.getState()?.activeCheckpointId ?? ""];
    const checkpoint = active ? { id: active.id, name: active.name, objective: active.objective } : null;
    const inputHash = canonInputHash(arcSummaries, facts, checkpoint);
    // Stale rebuilds even when the hash matches: the validity change it saw is invisible to the hash.
    if (!force && !memory.canon?.stale && memory.canon?.inputHash === inputHash) return false;
    // No window: the canon is synthesised from arc summaries and facts, not from a span of the
    // transcript, so an ordinary edit must not discard it. Chat, story, version and epoch still do.
    const run = beginRun(this.deps.ownership());
    this.inFlight = true;
    try {
      const prompt = buildCanonSummaryPrompt(story.title, arcSummaries, facts, checkpoint);
      const reply = await this.ask(prompt, run.signal);
      if (!run.stillOwns()) return false;
      if (reply.cut) this.deps.journal?.("canon not refreshed", `${reply.cut}; the story so far keeps the text from ${memory.canon?.updatedAt ?? "no earlier pass"} until the next pass`);
      let trimmed = stripChannelNoise(reply.text);
      if (!trimmed) return false;
      const judge = this.deps.judge?.() ?? null;
      const use = draft ? "canonDraft" : "canonVerify";
      if (judge?.active(use)) {
        const kit = await import("./canonVerification");
        if (!run.stillOwns()) return false;
        trimmed = await kit.verifyCanonText(judge, trimmed, { storyTitle: story.title, cast: story.roster.map((member) => member.name ?? member.id), checkpoint, arcSummaries, facts }, use);
        if (!run.stillOwns()) return false;
      }
      const current = this.deps.memory();
      const arcs = resolvedArcs(current.arcs).filter((arc) => !arc.foldedInto);
      const sourceFacts = this.canonFacts(current);
      const currentActive = story.checkpointById[this.deps.getState()?.activeCheckpointId ?? ""];
      const currentCheckpoint = currentActive ? { id: currentActive.id, name: currentActive.name, objective: currentActive.objective } : null;
      const currentSummaries = arcs.map((arc) => arc.summary ? this.deps.restingLines(arc.summary) : "").filter(Boolean);
      if (canonInputHash(currentSummaries, sourceFacts.map((entry) => entry.text), currentCheckpoint) !== inputHash) return false;
      const sources: CanonSource[] = [
        ...sourceFacts.map((entry) => ({ store: "memory" as const, id: entry.id, ...(entry.provenance ? { provenance: entry.provenance } : {}) })),
        ...arcs.map((arc) => ({ store: "memory" as const, id: arc.id }))
      ];
      if (!draft) this.deps.record({ kind: "canon", inputs: sources.map((source) => source.id) });
      // The prose cannot carry envelopes sentence by sentence, so what a reader can check is what
      // it was built from — recorded as it was at the moment of synthesis.
      const canon = { text: trimmed, inputHash, updatedAt: new Date().toISOString(), stale: false, sources, ...(active ? { checkpointId: active.id } : {}) };
      this.deps.patch(draft ? { canonDraft: { ...canon, messageId: this.deps.getState()?.lastMessageId ?? -1 } } : { canon, canonDraft: null });
      await this.deps.save();
      return true;
    } finally {
      // Deliberately NOT guarded. This flag is this runtime's own in-flight bookkeeping, not
      // chat state; leaving it set because the world moved would wedge canon regeneration for
      // the rest of the session. A `finally` that releases something the run itself took is the
      // one kind of post-await write that must always run.
      this.inFlight = false;
    }
  }

  async decideDraft(accept: boolean): Promise<boolean> {
    const draft = this.deps.memory().canonDraft;
    const story = this.deps.getStory();
    const memory = this.deps.memory();
    if (!draft || !story || !this.deps.enabled()) return false;
    const active = story.checkpointById[this.deps.getState()?.activeCheckpointId ?? ""];
    const checkpoint = active ? { id: active.id, name: active.name, objective: active.objective } : null;
    const summaries = resolvedArcs(memory.arcs).filter((arc) => !arc.foldedInto).map((arc) => arc.summary ? this.deps.restingLines(arc.summary) : "").filter(Boolean);
    const hash = canonInputHash(summaries, this.canonFacts(memory).map((entry) => entry.text), checkpoint);
    if (accept && (hash !== draft.inputHash || draft.stale)) return false;
    const run = beginRun(this.deps.ownership());
    if (!run.stillOwns()) return false;
    if (accept) this.deps.record({ kind: "canon", inputs: (draft.sources ?? []).map((source) => source.id) });
    this.deps.patch({ canonDraft: null, ...(accept ? { canon: draft } : {}) });
    await this.deps.save();
    return true;
  }
}
