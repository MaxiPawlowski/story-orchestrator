import { applySamplerOverlay, type SamplerApi, type SamplerValues } from "@utils/samplerKeys";

export interface SamplerOverlaySpec {
  chatId: string;
  checkpointId: string;
  name: string;
  api: SamplerApi;
  values: SamplerValues;
  unknown: string[];
}

export interface SamplerOverlayView extends SamplerOverlaySpec {
  applied: number;
  lastApplied: string[];
  lastSkipped: string[];
}

export interface SamplerRequest {
  api: SamplerApi;
  chatId: string | null;
  type: string | null;
  dryRun: boolean;
  open: boolean;
  innermost: string | null;
}

const WITHHOLDING: ReadonlySet<string> = new Set(["quiet", "impersonate"]);

export const isLoudRequest = (request: SamplerRequest): boolean =>
  !request.dryRun && request.open && !WITHHOLDING.has(request.innermost ?? "") && !WITHHOLDING.has(request.type ?? "");

export class SamplerOverlay {
  private active: SamplerOverlayView | null = null;

  set(spec: SamplerOverlaySpec) {
    this.active = { ...spec, values: { ...spec.values }, unknown: [...spec.unknown], applied: 0, lastApplied: [], lastSkipped: [] };
  }

  clear() {
    this.active = null;
  }

  view(): SamplerOverlayView | null {
    return this.active ? { ...this.active, values: { ...this.active.values } } : null;
  }

  apply(payload: Record<string, unknown>, request: SamplerRequest): { first: boolean; applied: string[]; skipped: string[] } | null {
    const active = this.active;
    if (!active || request.api !== active.api || request.chatId !== active.chatId || !isLoudRequest(request)) return null;
    const result = applySamplerOverlay(payload, active.values);
    active.applied += 1;
    active.lastApplied = result.applied;
    active.lastSkipped = result.skipped;
    return { first: active.applied === 1, ...result };
  }
}

export const samplerOverlay = new SamplerOverlay();
