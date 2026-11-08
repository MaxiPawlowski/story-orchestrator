import { depthCacheKey, depthPath, DEPTH_MODEL, type DepthModel } from "./key";

export interface DepthAssets { depthUrl: string; maskUrl?: string }
export interface DepthSource { sha256: string }
export type DepthState = "unknown" | "cached" | "producing" | "missing" | "failed" | "off";

export interface DepthDeps {
  identify(url: string, signal: AbortSignal): Promise<DepthSource>;
  exists(path: string, signal: AbortSignal): Promise<boolean>;
  canProduce(): Promise<boolean>;
  enqueue<T>(label: string, run: (signal: AbortSignal) => Promise<T>): Promise<T>;
  produce(url: string, key: string, signal: AbortSignal): Promise<string>;
  mask?(depthUrl: string, url: string, signal: AbortSignal): Promise<string | null>;
  now(): number;
  log?(message: string): void;
  model?: DepthModel;
}

interface Failure { at: number; count: number; reason: string }

export const RETRY_MS = 10 * 60_000;
export const MAX_FAILURES = 3;

const url = (path: string): string => `/${path}`;

export class DepthCache {
  private keys = new Map<string, string>();
  private found = new Map<string, DepthAssets>();
  private producing = new Map<string, Promise<DepthAssets | null>>();
  private requests = new Map<string, Promise<DepthAssets | null>>();
  private failures = new Map<string, Failure>();
  private masks = new Map<string, Promise<string | null>>();
  private listeners = new Set<(url: string, assets: DepthAssets) => void>();
  private states = new Map<string, DepthState>();

  constructor(private readonly deps: DepthDeps) {}

  private get model(): DepthModel { return this.deps.model ?? DEPTH_MODEL; }

  state(source: string): DepthState { return this.states.get(source) ?? "unknown"; }

  peek(source: string): DepthAssets | null {
    const key = this.keys.get(source);
    return key ? this.found.get(key) ?? null : null;
  }

  subscribe(listener: (url: string, assets: DepthAssets) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async keyFor(source: string, signal: AbortSignal): Promise<string> {
    const known = this.keys.get(source);
    if (known) return known;
    const { sha256 } = await this.deps.identify(source, signal);
    const key = depthCacheKey(sha256, this.model);
    this.keys.set(source, key);
    return key;
  }

  async lookup(source: string, signal: AbortSignal): Promise<DepthAssets | null> {
    const key = await this.keyFor(source, signal);
    const hit = this.found.get(key);
    if (hit) return hit;
    if (!(await this.deps.exists(depthPath(key), signal))) return null;
    return this.remember(source, key, url(depthPath(key)), signal);
  }

  request(source: string, signal: AbortSignal): Promise<DepthAssets | null> {
    const running = this.requests.get(source);
    if (running) return running;
    const request = this.resolve(source, signal).finally(() => { this.requests.delete(source); });
    this.requests.set(source, request);
    return request;
  }

  private async resolve(source: string, signal: AbortSignal): Promise<DepthAssets | null> {
    const hit = await this.lookup(source, signal).catch((error: unknown) => {
      this.deps.log?.(`Depth lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    });
    if (hit) { this.states.set(source, "cached"); return hit; }
    if (hit === undefined) { this.states.set(source, "failed"); return null; }
    const key = this.keys.get(source);
    if (!key) return null;
    const running = this.producing.get(key);
    if (running) return running;
    const failure = this.failures.get(key);
    if (failure && (failure.count >= MAX_FAILURES || this.deps.now() - failure.at < RETRY_MS)) { this.states.set(source, "failed"); return null; }
    const job = this.produce(source, key, signal).finally(() => { this.producing.delete(key); });
    this.producing.set(key, job);
    return job;
  }

  private async produce(source: string, key: string, signal: AbortSignal): Promise<DepthAssets | null> {
    if (!(await this.deps.canProduce())) { this.states.set(source, "off"); return null; }
    this.states.set(source, "producing");
    try {
      const path = await this.deps.enqueue("Backdrop depth", (queued) => this.deps.produce(source, key, queued));
      this.failures.delete(key);
      return await this.remember(source, key, url(path), signal);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (!aborted) {
        const previous = this.failures.get(key);
        this.failures.set(key, { at: this.deps.now(), count: (previous?.count ?? 0) + 1, reason });
      }
      this.states.set(source, aborted ? "missing" : "failed");
      this.deps.log?.(`Depth not produced: ${reason}`);
      return null;
    }
  }

  lastFailure(source: string): string | null {
    const key = this.keys.get(source);
    return key ? this.failures.get(key)?.reason ?? null : null;
  }

  private async remember(source: string, key: string, depthUrl: string, signal: AbortSignal): Promise<DepthAssets> {
    const maskUrl = await this.maskFor(key, depthUrl, source, signal);
    const assets: DepthAssets = { depthUrl, ...(maskUrl ? { maskUrl } : {}) };
    this.found.set(key, assets);
    this.states.set(source, "cached");
    for (const [other, otherKey] of this.keys) if (otherKey === key) this.listeners.forEach((listener) => listener(other, assets));
    return assets;
  }

  private maskFor(key: string, depthUrl: string, source: string, signal: AbortSignal): Promise<string | null> {
    if (!this.deps.mask) return Promise.resolve(null);
    const known = this.masks.get(key);
    if (known) return known;
    const made = this.deps.mask(depthUrl, source, signal).catch((error: unknown) => {
      this.masks.delete(key);
      this.deps.log?.(`Sky mask skipped: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    this.masks.set(key, made);
    return made;
  }
}
