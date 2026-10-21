import { beginRun, type RunGuard, type RunOwnership } from "@runtime/runToken";
import { blinkProblems, overBase, stillOpen, type EyeRead } from "./eyeOpen";
import { cleanEdges } from "./edges";
import { checkPixels, checkMouthCoverage, pasteEdit, validateBox, type HeadBox, type PixelImage, type PixelQA } from "./pixels";
import { skeletonImage } from "../poses/skeleton";
import type { PoseEntry } from "@engine/poseSchema";
import { contentHash, editGraph, editInstruction, editKey, renderKey, type EditKind, type EditModels } from "./recipes";
import type { AlphaRecipe } from "@services/stHost/media";
import { referenceProblems } from "./referencePack";
import { mouthRegion, validateRegion, type FrameRegion } from "./frameRegion";
import { RawEditCache } from "./rawCache";
import { validateBuildRequest } from "./buildRequest";
import { alignEdit, MASK_IMPORT_KINDS, type MaskImportReport } from "./maskImport";
import { isFrameKey, isMouthFrameKey } from "../frameKeys";

export interface BuildTimings { prepareMs: number; leaseMs: number; uploadMs: number; renderMs: number; decodeMs: number; compositeMs: number;
  referenceReleaseMs: number; leaseReleaseMs: number; totalMs: number; cacheHit: boolean; fingerprintMs?: number }

export interface SpriteBuildRequest {
  character: string;
  set: string;
  label: string;
  kind: EditKind;
  value: string;
  reference: string;
  referenceHash?: string;
  box: HeadBox;
  models: EditModels;
  seed: number;
  steps: number;
  story?: string;
  member?: string;
  cutout?: AlphaRecipe;
  resolution?: number;
  frameRegion?: FrameRegion;
  pose?: PoseEntry["keypoints"];
  poseRoute?: "p2" | "p3"; poseSecondReference?: boolean;
  body?: import("../poses/bodyRenderer").BodyStamp;
  visualRoot?: string;
}

export interface SpriteCandidate {
  request: SpriteBuildRequest;
  key: string;
  data: string;
  qa: PixelQA;
  seconds: number;
  timings?: BuildTimings;
  rawData?: string;
  referenceData?: string;
  inputs: { base: string; models: EditModels; kind: EditKind; value: string; seed: number; steps: number; box: HeadBox;
    story?: string; member?: string; cutout?: AlphaRecipe; resolution?: number; frameRegion?: FrameRegion; pose?: unknown; body?: import("../poses/bodyRenderer").BodyStamp; visualRoot?: string };
}

export interface BuilderDeps {
  ownership: RunOwnership;
  decode(src: string): Promise<PixelImage>;
  encode(image: PixelImage): string;
  crop(image: PixelImage, box: HeadBox): Promise<string>;
  resize(image: PixelImage, box: HeadBox): PixelImage;
  uploadReference(data: string, signal: AbortSignal, scope?: { character: string; set: string; story?: string }): Promise<string>;
  releaseReference?(name: string): Promise<void>;
  render(graph: Record<string, unknown>, signal: AbortSignal): Promise<{ data: string; format: string }>;
  lease(request: SpriteBuildRequest, signal: AbortSignal): Promise<{ release(): Promise<void> }>;
  save(candidate: SpriteCandidate, expectedHash?: string): Promise<{ path: string; sha256: string }>;
  lineage?(request: SpriteBuildRequest, signal: AbortSignal): Promise<{ root: string; current(): boolean } | null>;
  eyes?(image: PixelImage, signal: AbortSignal): Promise<EyeRead | null>;
}

export function renderedBox(box: HeadBox, raw: Pick<PixelImage, "width" | "height">): HeadBox {
  const scale = Math.max(1, Math.min(raw.width / box.width, raw.height / box.height));
  return { x: 0, y: 0, width: Math.round(box.width * scale), height: Math.round(box.height * scale) };
}

function composeEdit(base: PixelImage, raw: PixelImage, box: HeadBox, kind: EditKind, region: FrameRegion | undefined,
  resize: BuilderDeps["resize"]): { output: PixelImage; maskImport?: MaskImportReport } {
  if (kind === "base") return { output: cleanEdges(resize(raw, renderedBox(box, raw))).image };
  if (kind === "pose") return { output: cleanEdges(resize(raw, box)).image };
  if (!MASK_IMPORT_KINDS.includes(kind)) return { output: pasteEdit(base, resize(raw, box), box, kind, region) };
  const aligned = alignEdit(base, raw, box, kind, region, resize);
  return { output: pasteEdit(base, aligned.edit, box, kind, region), maskImport: aligned.report };
}

export const RETRY_REFUSAL = /Render it again|eye open \(/;
export const RETRY_SEED_STEP = 7919;

export class SpriteBuilder {
  private controller: AbortController | null = null;
  private candidates = new Map<string, RunGuard>();
  private raw = new RawEditCache();
  private lineageChecks = new Map<string, () => boolean>();

  constructor(private readonly deps: BuilderDeps) {}

  cancel(): void { this.controller?.abort(); }

  close(): void {
    this.cancel();
    for (const run of this.candidates.values()) run.release();
    this.candidates.clear();
    this.lineageChecks.clear();
    this.raw.clear();
  }

  async build(request: SpriteBuildRequest): Promise<SpriteCandidate> {
    try { return await this.buildOnce(request); }
    catch (error) {
      if (!(error instanceof Error) || !RETRY_REFUSAL.test(error.message) || this.controller) throw error;
      return this.buildOnce({ ...request, seed: (request.seed + RETRY_SEED_STEP) >>> 0 });
    }
  }

  private async buildOnce(request: SpriteBuildRequest): Promise<SpriteCandidate> {
    if (this.controller) throw new Error("Finish or cancel the current sprite first.");
    const resolution = validateBuildRequest(request);
    const controller = new AbortController();
    this.controller = controller;
    const run = beginRun(this.deps.ownership);
    const abort = () => controller.abort();
    run.signal.addEventListener("abort", abort, { once: true });
    let retained = false;
    let lease: { release(): Promise<void> } | null = null;
    let reference: string | null = null;
    let skeleton: string | null = null;
    const start = performance.now();
    let candidate: SpriteCandidate | null = null;
    let lineage: { root: string; current(): boolean } | null = null;
    const timings: BuildTimings = { prepareMs: 0, leaseMs: 0, uploadMs: 0, renderMs: 0, decodeMs: 0, compositeMs: 0,
      referenceReleaseMs: 0, leaseReleaseMs: 0, totalMs: 0, cacheHit: false };
    const timed = async <T>(field: Exclude<keyof BuildTimings, "cacheHit">, work: () => Promise<T>): Promise<T> => {
      const began = performance.now();
      try { return await work(); } finally { timings[field] = performance.now() - began; }
    };
    const guard = () => {
      controller.signal.throwIfAborted();
      if (!run.stillOwns()) throw new Error("The story or draft changed. Build this sprite again for the current draft.");
      if (lineage && !lineage.current()) throw new Error("The accepted visual source changed. Build this sprite again.");
    };
    try {
      guard();
      lineage = await this.deps.lineage?.(request, controller.signal) ?? null;
      guard();
      const base = await this.deps.decode(request.reference);
      const box = request.kind === "look" || request.kind === "base" || request.kind === "pose" ? { x: 0, y: 0, width: base.width, height: base.height } : request.box;
      validateBox(base, box);
      const region = isMouthFrameKey(request.kind) || request.kind === "rest" ? request.frameRegion ?? mouthRegion(box) : undefined;
      if (region) validateRegion(box, region);
      if (request.kind !== "base" && (!base.data.some((value, at) => at % 4 === 3 && value < 255) || !base.data.some((value, at) => at % 4 === 3 && value > 0))) {
        throw new Error("Choose a transparent reference sprite with a visible subject before generating expressions.");
      }
      const baseHash = base.sha256 ?? await contentHash(new Uint8Array(base.data));
      if (request.referenceHash && request.referenceHash !== baseHash) throw new Error("The reference sprite changed before the render. Read the pack again.");
      const inputs = { base: baseHash, models: request.models, kind: request.kind, value: request.value, seed: request.seed,
        ...(lineage || request.visualRoot ? { visualRoot: lineage?.root ?? request.visualRoot } : {}),
        steps: request.steps, box, resolution, ...(region ? { frameRegion: region } : {}), story: request.story, member: request.member,
          ...(request.body ? { body: request.body } : {}), ...(request.pose ? { pose: { keypoints: request.pose, route: request.poseRoute ?? "p2" },
          poseRoute: request.poseRoute ?? "p2", poseSecondReference: request.poseSecondReference === true } : {}), ...(request.cutout ? { cutout: request.cutout } : {}) };
      const key = await editKey(inputs);
      const crop = await this.deps.crop(base, box);
      const rawKey = await renderKey(inputs);
      timings.prepareMs = performance.now() - start;
      guard();
      let raw = this.raw.get(rawKey);
      timings.cacheHit = Boolean(raw);
      if (!raw) {
        lease = await timed("leaseMs", () => this.deps.lease({ ...request, resolution, box }, controller.signal));
        guard();
        reference = await timed("uploadMs", () => this.deps.uploadReference(crop, controller.signal, { character: request.character, set: request.set, story: request.story }));
        guard();
        if (request.pose && request.poseRoute !== "p3") {
          guard();
          skeleton = await this.deps.uploadReference(skeletonImage(request.pose), controller.signal, { character: request.character, set: request.set, story: request.story });
          guard();
        }
        const result = await timed("renderMs", () => this.deps.render(editGraph({ models: request.models, steps: request.steps, seed: request.seed,
reference: reference as string, instruction: editInstruction(request.kind, request.value), cutout: request.cutout, resolution, ...(skeleton ? { skeleton } : {}),
            secondReference: request.poseRoute === "p3" && request.poseSecondReference === true }), controller.signal));
        const image = await timed("decodeMs", () => this.deps.decode(`data:image/${result.format};base64,${result.data}`));
        guard();
        raw = { image, data: result.data };
        this.raw.put(rawKey, raw);
      }
      guard();
      const compositeStart = performance.now();
      const full = request.kind === "base" || request.kind === "pose";
      const { output, maskImport } = composeEdit(base, raw.image, box, request.kind, region, this.deps.resize);
      const reasons = full ? referenceProblems(output) : [];
      const qa = full ? { ok: !reasons.length, reasons, changed: 0,
        alphaPixels: output.data.filter((value, at) => at % 4 === 3 && value <= 8).length, ringDrift: 0 }
        : checkPixels(base, output, box, isFrameKey(request.kind));
      if (region) qa.reasons.push(...checkMouthCoverage(base, output, box, region, request.kind !== "rest"));
      if (request.kind === "blink" && this.deps.eyes) {
        const before = await this.deps.eyes(base, controller.signal).catch(() => null);
        guard();
        if (before?.boxes) {
          const shown = overBase(base, output);
          const after = await this.deps.eyes(shown, controller.signal).catch(() => null);
          guard();
          qa.reasons.push(...blinkProblems(base, shown, before.boxes, stillOpen(before.openness, after?.openness)));
        }
      }
      qa.maskImport = maskImport;
      qa.ok = qa.ok && !qa.reasons.length;
      if (!qa.ok) throw new Error(qa.reasons.join(" "));
      candidate = { request: { ...request, box: { ...request.box } }, inputs, key, timings, rawData: raw.data, referenceData: crop,
        data: this.deps.encode(output), qa, seconds: 0 };
      timings.compositeMs = performance.now() - compositeStart;
      this.candidates.get(key)?.release();
      this.candidates.set(key, run);
      this.lineageChecks.set(key, () => !lineage || lineage.current());
      retained = true;
      return candidate;
    } finally {
      try {
        try {
          try { if (skeleton) await this.deps.releaseReference?.(skeleton); }
          finally { if (reference) await timed("referenceReleaseMs", async () => this.deps.releaseReference?.(reference as string)); }
        } finally { if (lease) await timed("leaseReleaseMs", () => (lease as { release(): Promise<void> }).release()); }
      }
      finally {
        run.signal.removeEventListener("abort", abort);
        if (!retained) run.release();
        if (this.controller === controller) this.controller = null;
        timings.totalMs = performance.now() - start;
        if (candidate) candidate.seconds = timings.totalMs / 1000;
      }
    }
  }

  async save(candidate: SpriteCandidate, expectedHash?: string): Promise<{ path: string; sha256: string }> {
    const run = this.candidates.get(candidate.key);
    if (!run?.stillOwns()) throw new Error("This preview belongs to an old story or draft. Generate it again before saving.");
    if (!this.lineageChecks.get(candidate.key)?.()) throw new Error("This preview belongs to an old accepted visual source.");
    if (!candidate.qa.ok) throw new Error("A failed sprite cannot be saved.");
    return this.deps.save(candidate, expectedHash);
  }
}
