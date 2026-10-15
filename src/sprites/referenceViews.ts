import { beginRun, type RunGuard, type RunOwnership } from "@runtime/runToken";
import { stableStringify } from "@runtime/hash";
import { anySignal } from "@utils/signals";
import type { AlphaRecipe } from "@services/stHost/media";
import type { EditModels } from "./builder/recipes";
import { REFERENCE_VIEWS, servedAsset, visualRoot, visualSources, withReferencePack, type ReferencePack, type ReferenceView, type VisualAsset, type VisualManifest } from "./visualManifest";

export const REFERENCE_VIEW_RECIPE = { id: "qwen21-reference-view", version: 1 } as const;
export const REFERENCE_VIEW_SEED = 1234;
export const RENDERED_VIEWS = ["three_quarter_left", "three_quarter_right", "profile", "back"] as const satisfies readonly ReferenceView[];
export type RenderedView = (typeof RENDERED_VIEWS)[number];
export const VIEW_LABELS: Record<ReferenceView, string> = {
  full_body: "Full body", front: "Front bust", three_quarter_left: "Three-quarter left", three_quarter_right: "Three-quarter right", profile: "Profile", back: "Back",
};

const ANGLES: Record<RenderedView, string> = {
  three_quarter_left: "turned three-quarters toward the image left, both eyes visible, the far cheek partly hidden",
  three_quarter_right: "turned three-quarters toward the image right, both eyes visible, the far cheek partly hidden",
  profile: "in strict side profile facing the image left, one eye visible, nose and chin silhouette clear",
  back: "seen from directly behind, back of the head and hair visible, no face visible",
};

export const viewInstruction = (view: RenderedView): string =>
  `Same character as image 1, standing ${ANGLES[view]}. Preserve identity, hair, outfit, colours, proportions and art style. `
  + "Whole body from head to feet, neutral relaxed pose, arms at the sides, no other characters, no scenery, no text. Plain white background.";

export interface ViewRoute { models: EditModels; steps: number; resolution: number; cutout: AlphaRecipe }
export interface ViewCandidate { view: RenderedView; data: string; sha256: string; key: string }
export interface ReferencePackReview { character: string; root: string; revision: number; views: ViewCandidate[] }
export interface ViewJob { render(view: RenderedView, instruction: string, key: string, signal: AbortSignal): Promise<string>; close(): Promise<void> }

export const referenceViewKey = (root: string, base: string, view: RenderedView, route: ViewRoute): string => stableStringify({
  recipe: REFERENCE_VIEW_RECIPE, root, base, view, instruction: viewInstruction(view), models: route.models, steps: route.steps,
  resolution: route.resolution, cutout: { id: route.cutout.id, node: route.cutout.node, model: route.cutout.model }, seed: REFERENCE_VIEW_SEED,
});

export const referencePackText = (root: string, views: Record<ReferenceView, VisualAsset>): string =>
  stableStringify({ recipe: REFERENCE_VIEW_RECIPE, root, views: REFERENCE_VIEWS.map((view) => ({ view, sha256: views[view].sha256, key: views[view].key })) });

export interface ReferencePackDeps {
  ownership: RunOwnership;
  read(character: string): VisualManifest | undefined;
  present(character: string, card: string): boolean;
  verify(source: VisualManifest, signal: AbortSignal): Promise<void>;
  route(character: string, signal: AbortSignal): Promise<ViewRoute>;
  open(source: VisualManifest, route: ViewRoute, signal: AbortSignal): Promise<ViewJob>;
  hash(value: string): Promise<string>;
  hashData(data: string): Promise<string>;
  save(character: string, set: string, candidate: ViewCandidate, signal: AbortSignal): Promise<VisualAsset>;
  commit(source: VisualManifest, run: RunGuard): void;
}

export class ReferencePackSession {
  private review: { value: ReferencePackReview; run: RunGuard } | null = null;
  private operation: RunGuard | null = null;
  private controller: AbortController | null = null;
  private cancelled = false;
  constructor(private readonly deps: ReferencePackDeps) {}

  cancel(): void {
    this.cancelled = true;
    for (const run of [this.review?.run, this.operation]) run?.release();
    this.controller?.abort();
    this.review = null; this.operation = null; this.controller = null;
  }

  private guard(run: RunGuard, character: string, root: string): VisualManifest {
    const source = this.deps.read(character);
    if (this.cancelled || (this.operation !== run && this.review?.run !== run) || !run.stillOwns() || !source || !this.deps.present(character, source.card.path)) {
      throw new Error("The card, story or review changed. Prepare the reference views again.");
    }
    if (visualRoot(source) !== root) throw new Error("A newer visual source was accepted. Prepare its reference views instead.");
    return source;
  }

  async prepare(character: string, progress?: (done: number, total: number) => void): Promise<ReferencePackReview> {
    this.cancel(); this.cancelled = false;
    const run = beginRun(this.deps.ownership), start = this.deps.read(character);
    this.operation = run;
    this.controller = new AbortController();
    const signal = anySignal([run.signal, this.controller.signal]);
    let job: ViewJob | null = null;
    try {
      if (!start) throw new Error("Accept this character's base and bust before preparing reference views.");
      const root = visualRoot(start);
      this.guard(run, character, root);
      await this.deps.verify(start, signal);
      this.guard(run, character, root);
      const route = await this.deps.route(character, signal);
      this.guard(run, character, root);
      job = await this.deps.open(start, route, signal);
      this.guard(run, character, root);
      const views: ViewCandidate[] = [];
      for (const view of RENDERED_VIEWS) {
        progress?.(views.length, RENDERED_VIEWS.length);
        const key = await this.deps.hash(referenceViewKey(root, start.base.sha256, view, route));
        this.guard(run, character, root);
        const data = await job.render(view, viewInstruction(view), key, signal);
        this.guard(run, character, root);
        const sha256 = await this.deps.hashData(data);
        this.guard(run, character, root);
        views.push({ view, data, sha256, key });
      }
      progress?.(views.length, RENDERED_VIEWS.length);
      const value: ReferencePackReview = { character, root, revision: start.revision, views };
      if (!run.stillOwns()) throw new Error("The draft changed before these reference views were ready.");
      this.review = { value, run }; this.operation = null;
      return structuredClone(value);
    } catch (error) { run.release(); if (this.operation === run) this.operation = null; throw error; }
    finally { if (job) await job.close(); }
  }

  async accept(review: ReferencePackReview): Promise<VisualManifest> {
    const pending = this.review;
    if (!pending || JSON.stringify(pending.value) !== JSON.stringify(review)) throw new Error("These are not the current reviewed reference views.");
    const { run, value } = pending, { character, root } = value;
    const signal = anySignal([run.signal, this.controller?.signal ?? AbortSignal.abort()]);
    const source = this.guard(run, character, root);
    await this.deps.verify(source, signal);
    this.guard(run, character, root);
    const saved: Partial<Record<ReferenceView, VisualAsset>> = { full_body: source.base, front: source.bust };
    for (const candidate of value.views) {
      const asset = servedAsset(await this.deps.save(character, `refpack_${candidate.key.slice(0, 16)}`, candidate, signal));
      this.guard(run, character, root);
      if (asset.sha256 !== candidate.sha256) throw new Error(`The saved ${VIEW_LABELS[candidate.view].toLowerCase()} view does not match the reviewed image.`);
      saved[candidate.view] = asset;
    }
    if (!REFERENCE_VIEWS.every((view) => saved[view])) throw new Error("The reference pack is missing a view.");
    const views = saved as Record<ReferenceView, VisualAsset>;
    const hash = await this.deps.hash(referencePackText(root, views));
    const current = this.guard(run, character, root);
    const pack: ReferencePack = { hash, views };
    const next = withReferencePack(current, root, pack);
    if (!visualSources({ [character]: next })[character]) throw new Error("The reviewed reference pack is incomplete.");
    if (!run.stillOwns()) throw new Error("The draft changed before this reference pack could be accepted.");
    this.deps.commit(next, run);
    this.review = null; run.release();
    return structuredClone(next);
  }
}
