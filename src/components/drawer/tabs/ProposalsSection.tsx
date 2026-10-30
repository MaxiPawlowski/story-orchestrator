import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import StagecraftPanel from "../StagecraftPanel";
import type { LivingActions } from "../LivingPanel";
import { lazyRetry } from "@utils/lazyRetry";

const LivingPanel = lazyRetry(() => import("../LivingPanel"));

const livingActions = (manager: RuntimeManager): LivingActions => ({
  decide: (id, status, edit) => manager.living.decide(id, status, edit),
  regenerate: (id) => manager.living.regenerate(id),
  runNow: () => manager.living.propose(),
  save: (includeUnreached) => manager.living.saveAsStory({ includeUnreached }),
});

export const ProposalsSection = ({ snapshot, manager, onOpenFact }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; onOpenFact?: (id: string) => void }) => (
  <div className="so-console-stack">
    <StagecraftPanel snapshot={snapshot} manager={manager} onOpenFact={onOpenFact} />
    {snapshot.living?.author ? <LivingPanel view={snapshot.living.author} canSave={snapshot.living.canSave} actions={livingActions(manager)} /> : null}
  </div>
);
