import type { ProbeTrigger } from "@extraction/index";
import type { HostSubscriptionEntry } from "@services/STAPI";

export interface BreakerWatchTarget {
  probe(trigger: ProbeTrigger): Promise<boolean>;
  reevaluateConfig(): void;
}

const profileIdOf = (profile: unknown): string | null =>
  typeof profile === "object" && profile !== null && "id" in profile && typeof profile.id === "string" ? profile.id : null;

export function breakerWatchEntries(target: () => BreakerWatchTarget | null, profileId: () => string | null): HostSubscriptionEntry[] {
  const reevaluate = () => target()?.reevaluateConfig();
  return [
    { eventName: "ONLINE_STATUS_CHANGED", handler: () => { void target()?.probe("online-status"); } },
    {
      eventName: "CONNECTION_PROFILE_UPDATED",
      handler: (_previous, next) => {
        const id = profileIdOf(next);
        if (!id || id !== profileId()) return;
        reevaluate();
        void target()?.probe("profile-updated");
      },
    },
    { eventName: "CONNECTION_PROFILE_DELETED", handler: reevaluate },
    { eventName: "CONNECTION_PROFILE_CREATED", handler: reevaluate },
  ];
}
