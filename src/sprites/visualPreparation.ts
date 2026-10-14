import { beginRun, type RunGuard, type RunOwnership } from "@runtime/runToken";
import { anySignal } from "@utils/signals";
import { visualSources, lookSignature, type VisualAsset, type VisualManifest } from "./visualManifest";
import type { HeadBox } from "./builder/pixels";

export interface VisualPreparationInput {
  character: string; card: { path: string; sha256: string }; baseSet: string; base: VisualAsset; box: HeadBox;
}
export interface VisualReview {
  input: VisualPreparationInput; data: string; sha256: string; key: string;
}
export interface VisualPreparationDeps {
  ownership: RunOwnership;
  read(character: string): VisualManifest | undefined;
  present(character: string, card: string): boolean;
  fingerprint(path: string, signal: AbortSignal): Promise<string>;
  crop(path: string, box: HeadBox, signal: AbortSignal): Promise<{ data: string; sha256: string }>;
  hash(value: string): Promise<string>;
  save(review: VisualReview, signal: AbortSignal): Promise<VisualAsset>;
  commit(source: VisualManifest): void;
}

export class VisualPreparation {
  private review: { value: VisualReview; run: RunGuard; revision: number } | null = null;
  private operation: RunGuard | null = null;
  private controller: AbortController | null = null;
  private cancelled = false;
  constructor(private readonly deps: VisualPreparationDeps) {}
  cancel(): void {
    this.cancelled = true;
    this.controller?.abort(); this.controller = null;
    this.review?.run.release(); this.review = null;
    this.operation?.release(); this.operation = null;
  }
  private guard(run: RunGuard, input: VisualPreparationInput, revision: number): void {
    if (this.cancelled || (this.operation !== run && this.review?.run !== run) || !run.stillOwns() || !this.deps.present(input.character, input.card.path)) {
      throw new Error("The card, story or review changed. Prepare presentation again.");
    }
    if ((this.deps.read(input.character)?.revision ?? 0) !== revision) throw new Error("A newer visual source was accepted. Review that source instead.");
  }
  async prepare(input: VisualPreparationInput): Promise<VisualReview> {
    this.cancel(); this.cancelled = false;
    const run = beginRun(this.deps.ownership), revision = this.deps.read(input.character)?.revision ?? 0;
    this.operation = run;
    this.controller = new AbortController();
    const signal = anySignal([run.signal, this.controller.signal]);
    const copy = structuredClone(input);
    try {
      this.guard(run, copy, revision);
      const [card, base] = await Promise.all([this.deps.fingerprint(copy.card.path, signal), this.deps.fingerprint(copy.base.path, signal)]);
      this.guard(run, copy, revision);
      if (card !== copy.card.sha256 || base !== copy.base.sha256) throw new Error("The source artwork changed. Choose and review it again.");
      const bust = await this.deps.crop(copy.base.path, copy.box, signal);
      this.guard(run, copy, revision);
      const key = await this.deps.hash(JSON.stringify({ recipe: "visual-source-v1", ...copy, bust: bust.sha256 }));
      this.guard(run, copy, revision);
      const value = { input: copy, ...bust, key };
      if (!run.stillOwns()) throw new Error("The draft changed before this review was ready.");
      this.review = { value, run, revision }; this.operation = null;
      return structuredClone(value);
    } catch (error) { run.release(); if (this.operation === run) this.operation = null; throw error; }
  }
  async accept(review: VisualReview): Promise<VisualManifest> {
    const pending = this.review;
    if (!pending || JSON.stringify(pending.value) !== JSON.stringify(review)) throw new Error("This is not the current reviewed candidate.");
    const { run, revision, value } = pending, { input } = value;
    const signal = anySignal([run.signal, this.controller?.signal ?? AbortSignal.abort()]);
    this.guard(run, input, revision);
    const [card, base] = await Promise.all([this.deps.fingerprint(input.card.path, signal), this.deps.fingerprint(input.base.path, signal)]);
    this.guard(run, input, revision);
    if (card !== input.card.sha256 || base !== input.base.sha256) throw new Error("The source changed during review. Prepare it again.");
    const bust = await this.deps.save(value, signal);
    this.guard(run, input, revision);
    if (bust.sha256 !== value.sha256) throw new Error("The saved bust does not match the reviewed image.");
    const source: VisualManifest = { id: value.key, revision: revision + 1, character: input.character, card: input.card,
      baseSet: input.baseSet, base: input.base, bust, box: input.box,
      looks: { default: { root: `${value.key}:${revision + 1}`, signature: lookSignature({}), base: input.base, bust } } };
    if (!visualSources({ [source.character]: source })[source.character]) throw new Error("The reviewed visual manifest is incomplete.");
    this.guard(run, input, revision);
    if (!run.stillOwns()) throw new Error("The draft changed before this source could be accepted.");
    this.deps.commit(source);
    this.review = null; run.release();
    return structuredClone(source);
  }
}
