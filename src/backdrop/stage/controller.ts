import type { BackdropEffect } from "@engine/backdropSchema";
import type { BackdropAssets, BackdropBase, BackdropLayerSpec, BackdropSettings, BackdropState } from "../types";
import { lookupAssets, noteBaseShown, onAssetsChanged } from "../assets";
import { mergeEffect, pickBackdrop, type Values } from "../select";
import { autoLayers, gateOpen, onLayersChanged, registeredLayer } from "./registry";
import { gradeFor, renderScale, tintFor, type Grade } from "./cover";
import { FrameStats, shouldDraw } from "./stats";
import { dimForContrast, relativeLuminance } from "./contrast";
import type { BackdropRenderer, BaseSource } from "./renderer";
import { easeFactor } from "./layers";
import { log } from "@utils/log";

export interface BackdropHost {
  readStill(): { url: string; key: string } | null;
  watchStill(listener: () => void): () => void;
  reducedMotion(): boolean;
  hidden(): boolean;
  onVisibility(listener: () => void): () => void;
  chatColumn(): { left: number; right: number } | null;
  sampleColumn(source: BaseSource, column: { left: number; right: number } | null): number | null;
  textLuminance(): number | null;
  setFlags(flags: { active: boolean; dim: boolean }): void;
  viewport(): { width: number; height: number; dpr: number };
  onResize(listener: () => void): () => void;
  onPointer(listener: (x: number, y: number) => void): () => void;
  loadImage(url: string): Promise<HTMLImageElement>;
  loadVideo(url: string): Promise<HTMLVideoElement>;
  requestFrame(callback: (now: number) => void): number;
  cancelFrame(handle: number): void;
  now(): number;
}

export interface BackdropStory {
  backdrop_defaults?: BackdropEffect;
  display?: { motion?: boolean };
  checkpointById: Readonly<Record<string, { effects?: { backdrop?: BackdropEffect } } | undefined>>;
}

export interface BackdropSources {
  settings(): BackdropSettings;
  story(): BackdropStory | null;
  checkpointId(): string | null;
  values(): Values;
  subscribe(listener: () => void): () => void;
}

export interface BackdropOverride {
  weather?: BackdropState["weather"];
  timeOfDay?: BackdropState["timeOfDay"];
  tension?: number;
  indoor?: boolean;
  layers?: BackdropEffect["layers"];
}

export interface BackdropView {
  active: boolean;
  reducedMotion: boolean;
  base: BackdropBase | null;
  state: BackdropState | null;
  layers: string[];
  intensity: number;
  assets: BackdropAssets;
  running: boolean;
  dim: number;
}

const sameSpecs = (left: readonly BackdropLayerSpec[], right: readonly BackdropLayerSpec[]): boolean => JSON.stringify(left) === JSON.stringify(right);

export const effectFor = (story: BackdropStory | null, checkpointId: string | null): BackdropEffect | null =>
  story ? mergeEffect(story.backdrop_defaults, checkpointId ? story.checkpointById[checkpointId]?.effects?.backdrop : undefined) : null;

export const overrideValues = (values: Values, override: BackdropOverride | null): Values => !override ? values : {
  ...values,
  ...(override.weather !== undefined ? { weather: override.weather } : {}),
  ...(override.timeOfDay !== undefined ? { time_of_day: override.timeOfDay } : {}),
  ...(override.tension !== undefined ? { tension_current: override.tension } : {}),
  ...(override.indoor !== undefined ? { indoor: override.indoor } : {}),
};

export class BackdropController {
  private readonly stats = new FrameStats();
  private readonly stops: Array<() => void> = [];
  private renderer: BackdropRenderer | null = null;
  private frame = 0;
  private lastDraw = 0;
  private clock = 0;
  private shownTint: [number, number, number] | null = null;
  private shownGrade: Grade | null = null;
  private pointer = { x: 0, y: 0 };
  private base: BackdropBase | null = null;
  private loadingKey = "";
  private loadingBase = "";
  private loadGen = 0;
  private assets: BackdropAssets = {};
  private assetsKey = "";
  private pendingAssets = "";
  private specs: BackdropLayerSpec[] = [];
  private state: BackdropState | null = null;
  private intensity = 0;
  private active = false;
  private reduced = false;
  private settings: BackdropSettings | null = null;
  private override: BackdropOverride | null = null;
  private stopped = false;
  private sample: number | null = null;
  private dim = 0;
  private shownIntensity: number | null = null;
  private contextGone = false;

  constructor(private readonly host: BackdropHost, private readonly sources: BackdropSources, private readonly makeRenderer: () => BackdropRenderer | null,
    private readonly showCanvas: (shown: boolean) => void) {}

  start(): () => void {
    this.stops.push(
      this.sources.subscribe(() => this.refresh()),
      this.host.watchStill(() => this.refresh()),
      this.host.onVisibility(() => { this.lastDraw = 0; this.renderer?.setPlaying(!this.host.hidden()); this.schedule(); }),
      this.host.onResize(() => { this.resize(); this.drawOnce(); }),
      this.host.onPointer((x, y) => { this.pointer = { x, y }; }),
      onAssetsChanged((key) => { if (!key || key === this.base?.key || key === this.assetsKey) { this.assetsKey = ""; this.pendingAssets = ""; this.refresh(); } }),
      onLayersChanged(() => this.refresh(true)),
    );
    this.refresh();
    return () => this.stop();
  }

  stop(): void {
    this.stopped = true;
    this.stops.splice(0).forEach((stop) => stop());
    if (this.frame) this.host.cancelFrame(this.frame);
    this.frame = 0;
    this.renderer?.dispose();
    this.renderer = null;
    this.host.setFlags({ active: false, dim: false });
    this.showCanvas(false);
    noteBaseShown(null);
  }

  setOverride(override: BackdropOverride | null): void {
    this.override = override;
    this.refresh(true);
  }

  view(): BackdropView {
    return {
      active: this.active, reducedMotion: this.reduced, base: this.renderer?.shownBase ?? null, state: this.state, layers: this.renderer?.layerKinds() ?? [],
      intensity: this.intensity, assets: this.assets, running: this.frame !== 0, dim: this.dim,
    };
  }

  contextLost(): void {
    this.contextGone = true;
    this.renderer?.markLost();
    this.deactivate();
  }

  contextRestored(): void {
    this.contextGone = false;
    this.refresh(true);
  }

  frameStats() { return { ...this.stats.view(), ...this.host.viewport(), canvas: this.renderer ? { width: this.renderer.width, height: this.renderer.height } : null }; }

  private still(): BackdropBase | null {
    const still = this.host.readStill();
    return still ? { kind: "image", url: still.url, key: still.key } : null;
  }

  private chooseBase(still: BackdropBase | null, effect: BackdropEffect | null, settings: BackdropSettings): BackdropBase | null {
    if (!still) return null;
    if (settings.loops !== "off" && this.assets.loopUrl && effect?.loop !== false && !this.reduced && this.assetsKey === still.key) return { kind: "video", url: this.assets.loopUrl, key: still.key };
    return still;
  }

  refresh(forceLayers = false): void {
    if (this.stopped) return;
    const settings = this.sources.settings();
    this.settings = settings;
    const story = this.sources.story();
    this.reduced = this.host.reducedMotion() || story?.display?.motion === false;
    const still = this.still();
    const effect = effectFor(story, this.sources.checkpointId());
    if (still && this.assetsKey !== still.key && this.pendingAssets !== still.key) { if (this.assetsKey) this.assets = {}; void this.fetchAssets(still); }
    const base = settings.enabled ? this.chooseBase(still, effect, settings) : null;
    const values = overrideValues(this.sources.values(), this.override);
    const pick = pickBackdrop({ sceneKey: still?.key ?? "", values, effect: this.override?.layers ? { ...(effect ?? {}), layers: this.override.layers } : effect, settings,
      reducedMotion: this.reduced });
    this.state = { ...pick.state, ...(this.override?.indoor !== undefined ? { indoor: this.override.indoor } : {}) };
    this.intensity = pick.intensity;
    this.updateDim();
    const auto = this.reduced || !base ? [] : autoLayers({ state: this.state, assets: this.assets, base, settings });
    const loopsOff = effect?.loop === false;
    const specs = [...pick.layers, ...auto].filter((spec) => {
      const entry = registeredLayer(spec.kind);
      return entry !== null && gateOpen(entry.gate, settings) && !(loopsOff && entry.gate === "loops");
    });
    const wantActive = Boolean(base) && settings.enabled;
    if (!wantActive) { this.deactivate(); return; }
    if (!this.ensureRenderer()) { this.deactivate(); return; }
    if (base && (base.url !== this.base?.url || base.kind !== this.base?.kind)) void this.loadBase(base);
    else if (base) { this.loadingKey = ""; this.loadingBase = ""; }
    if (this.reduced) this.renderer?.settle();
    if (forceLayers || !sameSpecs(specs, this.specs)) {
      this.specs = specs;
      try { this.renderer?.setLayers(specs, this.assets); }
      catch (error) { log.warn("Backdrop layers could not be built; showing the still", error); this.specs = []; this.renderer?.setLayers([], this.assets); }
    }
    this.host.setFlags({ active: this.active, dim: this.active && settings.dimBehindChat });
    this.schedule();
  }

  private async fetchAssets(still: BackdropBase): Promise<void> {
    this.pendingAssets = still.key;
    const found = await lookupAssets(still);
    if (this.stopped || this.pendingAssets !== still.key) return;
    this.pendingAssets = "";
    this.assetsKey = still.key;
    const changed = JSON.stringify(found) !== JSON.stringify(this.assets);
    this.assets = found;
    if (changed) this.refresh(true);
  }

  private ensureRenderer(): boolean {
    if (this.renderer) return true;
    if (this.contextGone) return false;
    try { this.renderer = this.makeRenderer(); }
    catch (error) { log.warn("The animated backdrop could not start WebGL; SillyTavern's background stays", error); this.renderer = null; }
    if (this.renderer) this.resize();
    return this.renderer !== null;
  }

  private deactivate(): void {
    this.active = false;
    this.base = null;
    this.loadingKey = "";
    this.loadingBase = "";
    this.specs = [];
    if (this.frame) this.host.cancelFrame(this.frame);
    this.frame = 0;
    this.renderer?.dispose();
    this.renderer = null;
    this.showCanvas(false);
    this.host.setFlags({ active: false, dim: false });
    noteBaseShown(null);
  }

  private async loadBase(base: BackdropBase): Promise<void> {
    const wanted = `${base.kind}:${base.url}`;
    if (this.loadingBase === wanted) return;
    this.loadingBase = wanted;
    const ticket = `${++this.loadGen}:${wanted}`;
    this.loadingKey = ticket;
    let source: BaseSource;
    try { source = base.kind === "video" ? await this.host.loadVideo(base.url) : await this.host.loadImage(base.url); }
    catch (error) {
      log.warn(`The backdrop could not load ${base.kind === "video" ? "its video loop" : "the background"}; ${base.kind === "video" ? "using the still" : "SillyTavern's background stays"}`, error);
      if (this.loadingKey !== ticket) return;
      this.loadingKey = "";
      this.loadingBase = "";
      if (base.kind === "video") { this.assets = { ...this.assets, loopUrl: undefined }; this.refresh(); }
      else if (this.active) this.deactivate();
      return;
    }
    if (this.stopped || this.loadingKey !== ticket || !this.renderer) { if (base.kind === "video") (source as HTMLVideoElement).pause(); return; }
    this.loadingBase = "";
    if (base.kind === "video" && this.host.hidden()) (source as HTMLVideoElement).pause();
    this.renderer.setBase(base, source, this.host.now(), this.reduced);
    if (base.kind === "image") { this.sample = this.host.sampleColumn(source, this.host.chatColumn()); this.updateDim(); }
    this.base = base;
    this.active = true;
    noteBaseShown(base);
    this.host.setFlags({ active: true, dim: Boolean(this.settings?.dimBehindChat) });
    this.drawOnce();
    this.showCanvas(true);
    this.schedule();
  }

  private updateDim(): void {
    if (!this.state) return;
    const tint = tintFor(this.state.timeOfDay, this.state.weather);
    const shade = 1 - (0.12 + this.state.tension * 0.25) * 0.15;
    const backdrop = this.sample === null ? null : this.sample * relativeLuminance(tint[0] * 255, tint[1] * 255, tint[2] * 255) * shade;
    this.dim = dimForContrast(backdrop, this.host.textLuminance());
  }

  private resize(): void {
    if (!this.renderer) return;
    const view = this.host.viewport(), scale = renderScale(view.dpr);
    this.renderer.resize(Math.round(view.width * scale), Math.round(view.height * scale));
  }

  private animated(now: number): boolean {
    if (!this.renderer || !this.active || this.reduced || this.host.hidden()) return false;
    return this.specs.length > 0 || this.renderer.fading(now) || this.renderer.hasVideo() || this.easing();
  }

  private easing(): boolean {
    if (this.shownIntensity !== null && Math.abs(this.shownIntensity - this.intensity) > 0.002) return true;
    if (!this.shownTint || !this.state) return false;
    const tint = tintFor(this.state.timeOfDay, this.state.weather);
    return this.shownTint.some((value, index) => Math.abs(value - tint[index]) > 0.002);
  }

  private schedule(): void {
    if (this.stopped) return;
    const now = this.host.now();
    if (this.animated(now)) {
      if (!this.frame) this.frame = this.host.requestFrame((time) => this.tick(time));
      return;
    }
    if (this.frame) { this.host.cancelFrame(this.frame); this.frame = 0; }
    this.stats.pause();
    if (this.active && !this.host.hidden()) this.drawOnce();
  }

  private tick(now: number): void {
    this.frame = 0;
    if (!this.animated(now)) { this.schedule(); return; }
    if (shouldDraw(now, this.lastDraw, this.renderer?.frameRate() ?? 60)) this.draw(now);
    this.frame = this.host.requestFrame((time) => this.tick(time));
  }

  private drawOnce(): void { if (this.active) this.draw(this.host.now()); }

  private draw(now: number): void {
    if (!this.renderer || !this.state) return;
    const view = this.host.viewport(), scale = renderScale(view.dpr);
    const dt = (this.lastDraw ? Math.min(100, Math.max(0, now - this.lastDraw)) : 16) / 1000;
    this.lastDraw = now;
    this.clock += this.reduced ? 0 : dt;
    const ease = easeFactor(dt, 1.2);
    this.shownIntensity = this.shownIntensity === null || this.reduced ? this.intensity : this.shownIntensity + (this.intensity - this.shownIntensity) * ease;
    const tint = tintFor(this.state.timeOfDay, this.state.weather);
    const shown = this.shownTint ?? tint;
    this.shownTint = this.reduced ? tint : [0, 1, 2].map((index) => shown[index] + (tint[index] - shown[index]) * ease) as [number, number, number];
    const grade = gradeFor(this.state.timeOfDay, this.state.weather), graded = this.shownGrade ?? grade;
    this.shownGrade = this.reduced ? grade : [0, 1, 2].map((index) => graded[index] + (grade[index] - graded[index]) * ease) as Grade;
    const column = this.settings?.dimBehindChat ? this.host.chatColumn() : null;
    const dim = column && view.width > 0 ? { left: column.left / view.width, right: column.right / view.width, amount: this.dim } : null;
    const begin = this.host.now();
    try {
      this.renderer.draw({
        time: this.clock, dt, width: this.renderer.width, height: this.renderer.height, dpr: scale, intensity: this.shownIntensity, pointer: this.pointer,
        state: this.state, tint: this.shownTint, grade: this.shownGrade, reducedMotion: this.reduced,
      }, dim, now);
    } catch (error) {
      log.warn("The animated backdrop stopped drawing; SillyTavern's background stays", error);
      this.deactivate();
      return;
    }
    this.stats.record(now, this.host.now() - begin);
  }
}
