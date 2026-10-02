import { isHarnessKey } from "@utils/harness";
import { FAILOVER_STRIKES, type BreakerEntry, type ExtractionHealth, type FailoverFailure, type FailoverGate } from "./breaker";

export interface FailoverView {
  isOpen(profileId: string): boolean;
  usable(profileId: string): boolean;
  fallbackId(): string | null;
  name(profileId: string): string;
  trip(profileId: string, detail: string): void;
}

export class Failover {
  private readonly counts = new Map<string, number>();

  constructor(private readonly view: FailoverView) {}

  readonly gate: FailoverGate = {
    open: (profileId) => this.view.isOpen(profileId),
    failed: (profileId, kind, detail) => {
      if (this.strike(profileId, kind)) this.view.trip(profileId, detail);
    },
  };

  private strike(profileId: string, kind: FailoverFailure): boolean {
    const strikes = kind === "timeout" ? FAILOVER_STRIKES : (this.counts.get(profileId) ?? 0) + 1;
    if (strikes < FAILOVER_STRIKES) {
      this.counts.set(profileId, strikes);
      return false;
    }
    this.counts.delete(profileId);
    return true;
  }

  clear(profileId: string) {
    this.counts.delete(profileId);
  }

  fallbackFor(profileId: string | null): string | null {
    const fallback = this.view.fallbackId();
    if (!profileId || !fallback || fallback === profileId || isHarnessKey(profileId)) return null;
    return this.view.isOpen(fallback) || !this.view.usable(fallback) ? null : fallback;
  }

  name(profileId: string | null): string | null {
    const fallback = this.fallbackFor(profileId);
    return fallback ? this.view.name(fallback) : null;
  }
}

export const transportHealth = (entry: BreakerEntry | null, fallback: string | null): ExtractionHealth | null => (entry
  ? { kind: "transport", detail: entry.lastFailure, since: entry.openedAt, nextProbeAt: entry.nextProbeAt, probing: entry.phase === "half-open", ...(fallback ? { fallback } : {}) }
  : null);

export const tripped = (profileId: string, read: boolean, fallback: string | null): string => {
  const subject = read ? "memory model" : `model profile ${profileId}`;
  return fallback ? `${subject} unreachable; using ${fallback}` : `${subject} not answering (outage); ${read ? "reads" : "its passes"} held until it answers`;
};

export const recovered = (fallback: string | null): string => (fallback ? `memory model answering again; leaving ${fallback}` : "memory model answering again");
