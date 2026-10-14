import { beginRun, type RunGuard, type RunOwnership } from "@runtime/runToken";
import { anySignal } from "@utils/signals";
import type { HeadBox } from "./builder/pixels";
import type { LiveHeadRef } from "./liveHeadRefs";
import type { HeadManifest } from "./liveHead/manifest";
import type { RigSynthesisInput } from "./liveHead/synthesis/synthesize";
import { visualHead, visualRoot, visualSources, type VisualAsset, type VisualManifest } from "./visualManifest";

export const LOOK_BUST_RECIPE = { id: "visual-look-bust-crop", version: 1 } as const;
export interface LookRebuildTarget { character: string; member: string; look: string }
export interface ChangedLookRow { look: string; state: "pending-bust" | "pending-rig"; base: VisualAsset; bust?: VisualAsset }
export interface LookRebuildReview {
  target: LookRebuildTarget; root: string; base: VisualAsset; box: HeadBox;
  bust: { path?: string; data?: string; sha256: string; key: string };
  rig?: HeadManifest; rigError?: string;
}
export interface LookRebuildDeps {
  ownership: RunOwnership;
  read(character: string): VisualManifest | undefined;
  present(character: string, card: string): boolean;
  fingerprint(path: string, signal: AbortSignal): Promise<string>;
  crop(path: string, box: HeadBox, signal: AbortSignal): Promise<{ data: string; sha256: string }>;
  hash(value: string): Promise<string>;
  synthesize(input: RigSynthesisInput, run: RunGuard): Promise<HeadManifest | null>;
  rehome(manifest: HeadManifest, source: string, sha256: string): HeadManifest;
  save(review: LookRebuildReview, signal: AbortSignal): Promise<VisualAsset>;
  commitBust(source: VisualManifest, run: RunGuard): void;
  commitRig(manifest: HeadManifest, run: RunGuard): void;
}

export function changedLookRows(source: VisualManifest | undefined, member: string, refs: Record<string, LiveHeadRef>): ChangedLookRow[] {
  if (!source) return [];
  return Object.entries(source.looks).flatMap(([look, row]): ChangedLookRow[] => {
    const head = visualHead(source, look, member, refs);
    return head.state === "pending-bust" || head.state === "pending-rig" ? [{ look, state: head.state, base: row.base, ...(row.bust ? { bust: row.bust } : {}) }] : [];
  });
}

export function publishLookBust(source: VisualManifest, root: string, look: string, baseSha256: string, bust: VisualAsset): VisualManifest {
  if (visualRoot(source) !== root) throw new Error("The accepted visual source changed. Rebuild this look again.");
  const current = source.looks[look];
  if (!current || current.root !== root) throw new Error("This look is no longer published for the accepted source.");
  if (current.base.sha256 !== baseSha256) throw new Error("This look's artwork changed while its bust was reviewed. Rebuild it again.");
  if (look === "default" && current.bust?.sha256 !== bust.sha256) throw new Error("Review the default bust under Prepare presentation.");
  const next = { ...source, looks: { ...source.looks, [look]: { ...current, bust } } };
  if (!visualSources({ [source.character]: next })[source.character]) throw new Error("The rebuilt look manifest is incomplete.");
  return next;
}

export function replaceRig(refs: Record<string, LiveHeadRef>, ref: LiveHeadRef, key: string): Record<string, LiveHeadRef> {
  return { ...Object.fromEntries(Object.entries(refs).filter(([, entry]) => entry.member !== ref.member || entry.look !== ref.look)), [key]: ref };
}

export class LookRebuild {
  private review: { value: LookRebuildReview; run: RunGuard } | null = null;
  private operation: RunGuard | null = null;
  private controller: AbortController | null = null;
  private cancelled = false;
  constructor(private readonly deps: LookRebuildDeps) {}
  cancel(): void {
    this.cancelled = true;
    for (const run of [this.review?.run, this.operation]) run?.release();
    this.controller?.abort();
    this.controller = null; this.review = null; this.operation = null;
  }
  private guard(run: RunGuard, target: LookRebuildTarget, root: string, baseSha256: string): VisualManifest {
    const source = this.deps.read(target.character);
    if (this.cancelled || (this.operation !== run && this.review?.run !== run) || !run.stillOwns() || !source || !this.deps.present(target.character, source.card.path))
      throw new Error("The card, story or review changed. Rebuild this look again.");
    if (visualRoot(source) !== root) throw new Error("A newer visual source was accepted. Rebuild against that source.");
    if (source.looks[target.look]?.base.sha256 !== baseSha256) throw new Error("This look's artwork changed. Rebuild it again.");
    return source;
  }
  async prepare(target: LookRebuildTarget): Promise<LookRebuildReview> {
    this.cancel(); this.cancelled = false;
    const run = beginRun(this.deps.ownership);
    this.operation = run; this.controller = new AbortController();
    const signal = anySignal([run.signal, this.controller.signal]);
    try {
      const source = this.deps.read(target.character), look = source?.looks[target.look];
      if (!source || !look || look.root !== visualRoot(source)) throw new Error("This look has no published artwork for the accepted source. Let the look render first.");
      const root = visualRoot(source), base = structuredClone(look.base), box = structuredClone(source.box);
      this.guard(run, target, root, base.sha256);
      if (await this.deps.fingerprint(base.path, signal) !== base.sha256) throw new Error("The changed-look file was modified outside Story Orchestrator. Let the look render again.");
      this.guard(run, target, root, base.sha256);
      let bust: LookRebuildReview["bust"];
      if (look.bust) {
        const kept = look.bust;
        if (await this.deps.fingerprint(kept.path, signal) !== kept.sha256) throw new Error("The saved bust for this look changed. Ask for a fresh bust.");
        bust = { path: kept.path, sha256: kept.sha256, key: kept.key };
      } else {
        const crop = await this.deps.crop(base.path, box, signal);
        this.guard(run, target, root, base.sha256);
        const key = await this.deps.hash(JSON.stringify({ recipe: LOOK_BUST_RECIPE, root, look: target.look, base: base.sha256, box, bust: crop.sha256 }));
        bust = { data: crop.data, sha256: crop.sha256, key };
      }
      this.guard(run, target, root, base.sha256);
      const value: LookRebuildReview = { target: structuredClone(target), root, base, box, bust };
      try {
        const rig = await this.deps.synthesize({ member: target.member, look: target.look, source: bust.path ?? `data:image/png;base64,${bust.data}`, sha256: bust.sha256 }, run);
        this.guard(run, target, root, base.sha256);
        if (rig) value.rig = rig;
        else value.rigError = "The rig was not prepared.";
      } catch (error) {
        this.guard(run, target, root, base.sha256);
        value.rigError = error instanceof Error ? error.message : String(error);
      }
      if (!run.stillOwns()) throw new Error("The draft changed before this review was ready.");
      this.review = { value, run }; this.operation = null;
      return structuredClone(value);
    } catch (error) { run.release(); if (this.operation === run) this.operation = null; throw error; }
  }
  async accept(review: LookRebuildReview): Promise<{ source: VisualManifest; rig?: HeadManifest }> {
    const pending = this.review;
    if (!pending || JSON.stringify(pending.value) !== JSON.stringify(review)) throw new Error("This is not the current reviewed look.");
    const { run, value } = pending, { target, root, base } = value;
    const signal = anySignal([run.signal, this.controller?.signal ?? AbortSignal.abort()]);
    this.guard(run, target, root, base.sha256);
    if (await this.deps.fingerprint(base.path, signal) !== base.sha256) throw new Error("The look changed during review. Rebuild it again.");
    let current = this.guard(run, target, root, base.sha256);
    let bust = current.looks[target.look].bust;
    if (!value.bust.path) {
      const saved = await this.deps.save(value, signal);
      current = this.guard(run, target, root, base.sha256);
      if (saved.sha256 !== value.bust.sha256) throw new Error("The saved bust does not match the reviewed image.");
      bust = saved;
      const next = publishLookBust(current, root, target.look, base.sha256, saved);
      if (!run.stillOwns()) throw new Error("The draft changed before this bust could be accepted.");
      this.deps.commitBust(next, run);
      current = next;
    }
    if (!bust || bust.sha256 !== value.bust.sha256) throw new Error("This look's bust changed during review. Rebuild it again.");
    let rig: HeadManifest | undefined;
    if (value.rig) {
      rig = this.deps.rehome(value.rig, bust.path, bust.sha256);
      this.guard(run, target, root, base.sha256);
      this.deps.commitRig(rig, run);
    }
    this.review = null; run.release();
    return { source: structuredClone(current), ...(rig ? { rig } : {}) };
  }
}
