export const BREAKER_BACKOFF_MS = [5000, 15000, 60000, 300000] as const;
export const PROBE_PROMPT = "Reply with exactly: PONG";
export const PROBE_MAX_TOKENS = 8;
export const PROBE_TIMEOUT_MS = 10000;
export const PROBE_TIMEOUT_MAX_MS = BREAKER_BACKOFF_MS[BREAKER_BACKOFF_MS.length - 1];
export const DANGLING_PROFILE_DETAIL = "The selected memory model profile no longer exists";
export const FAILOVER_STRIKES = 2;

export type ProbeTrigger = "backoff" | "online-status" | "profile-updated" | "player";
export type FailureClass = "lapsed" | "transport" | "config" | "exhausted" | "busy" | "bug";

export interface ProbeResult {
  ok: boolean;
  kind?: "lapsed" | "timeout" | "transport" | "config";
  message?: string;
}

export interface BreakerEntry {
  phase: "open" | "half-open";
  step: number;
  openedAt: number;
  nextProbeAt: number;
  lastFailure: string;
}

export type ExtractionHealth =
  | { kind: "transport"; detail: string; since: number; nextProbeAt: number; probing: boolean; fallback?: string }
  | { kind: "config"; detail: string };

export type FailoverFailure = "timeout" | "transport";

export interface FailoverGate {
  open(profileId: string): boolean;
  failed(profileId: string, kind: FailoverFailure, detail: string): void;
}

export const failureClass = (error: unknown): FailureClass => {
  const kind = error instanceof Error && error.name === "ModelCallError" && "kind" in error ? error.kind : null;
  if (kind === "lapsed" || kind === "config") return kind;
  if (kind === "refused") return "config";
  if (kind === "reasoning-exhausted") return "exhausted";
  if (kind === "busy") return "busy";
  return kind === "transport" || kind === "timeout" || kind === "auth" || kind === "quota" || kind === "malformed" ? "transport" : "bug";
};

/** A quota answer names when the route may be asked again; the breaker holds it at least that long. */
export const failedRetryAt = (error: unknown): number | null => {
  const retryAt = error instanceof Error && error.name === "ModelCallError" && "retryAt" in error ? error.retryAt : null;
  return typeof retryAt === "number" && Number.isFinite(retryAt) ? retryAt : null;
};

/** The profile a failed call went to, so its breaker, not the read path's, takes the failure. */
export const failedProfile = (error: unknown): string | null => {
  const profileId = error instanceof Error && error.name === "ModelCallError" && "profileId" in error ? error.profileId : null;
  return typeof profileId === "string" && profileId ? profileId : null;
};

export const backoffFor = (step: number): number => BREAKER_BACKOFF_MS[Math.min(Math.max(0, step), BREAKER_BACKOFF_MS.length - 1)];

export const probeTimeoutMs = (step: number, slowestAnsweredMs: number | null): number =>
  Math.min(PROBE_TIMEOUT_MAX_MS, Math.max(PROBE_TIMEOUT_MS, backoffFor(step), slowestAnsweredMs ?? 0));

export class Breaker {
  private readonly entries = new Map<string, BreakerEntry>();

  entry(profileId: string): BreakerEntry | null {
    return this.entries.get(profileId) ?? null;
  }

  isOpen(profileId: string): boolean {
    return this.entries.has(profileId);
  }

  trip(profileId: string, failure: string, now: number, holdUntil: number | null = null): boolean {
    const current = this.entries.get(profileId);
    if (current) {
      current.lastFailure = failure;
      if (holdUntil && holdUntil > current.nextProbeAt) current.nextProbeAt = holdUntil;
      return false;
    }
    this.entries.set(profileId, { phase: "open", step: 0, openedAt: now, nextProbeAt: Math.max(now + backoffFor(0), holdUntil ?? 0), lastFailure: failure });
    return true;
  }

  beginProbe(profileId: string): boolean {
    const current = this.entries.get(profileId);
    if (!current || current.phase !== "open") return false;
    current.phase = "half-open";
    return true;
  }

  probeFailed(profileId: string, failure: string, now: number): BreakerEntry | null {
    const current = this.entries.get(profileId);
    if (!current) return null;
    current.phase = "open";
    current.step += 1;
    current.nextProbeAt = now + backoffFor(current.step);
    current.lastFailure = failure;
    return current;
  }

  close(profileId: string): boolean {
    return this.entries.delete(profileId);
  }
}
