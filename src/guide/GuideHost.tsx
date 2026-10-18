import { useMemo } from "react";
import { HOME_PAGE } from "@features/guideLinks";
import type { RuntimeSnapshot } from "@runtime/types";
import { getGlobalSettings } from "@runtime/settingsStore";
import { workspaceNavigation } from "@runtime/workspaceNavigation";
import { requestTour } from "./tour/request";
import { guideShowOf } from "./showTarget";
import { GUIDE_ASSETS, GUIDE_NAV, GUIDE_PAGES } from "./pages.generated";
import { GuideReader } from "./GuideReader";
import { quickStartState } from "./quickStart";
import type { GuideTarget } from "./types";

export interface GuideHostProps {
  authorView: boolean;
  target: GuideTarget | null;
  onTargetSeen: () => void;
  snapshot?: RuntimeSnapshot;
  groupOpen?: boolean;
  onShowMe?: () => void;
}

const assetSrc = (asset: string): string | undefined => GUIDE_ASSETS[asset];

export default function GuideHost({ authorView, target, onTargetSeen, snapshot, groupOpen = false, onShowMe }: GuideHostProps) {
  const checks = useMemo(() => (snapshot ? quickStartState({ snapshot, settings: getGlobalSettings(), groupOpen }) : undefined), [snapshot, groupOpen]);
  const show = (value: string) => {
    const target = guideShowOf(value);
    if (!target) return;
    onShowMe?.();
    if (target.kind === "open") workspaceNavigation.open(target.intent);
    else requestTour(target.request.view, target.request.stop);
  };
  return <GuideReader pages={GUIDE_PAGES} nav={GUIDE_NAV} authorView={authorView} homePage={HOME_PAGE} target={target} onTargetSeen={onTargetSeen} assetSrc={assetSrc}
    checks={checks} onShow={snapshot ? show : undefined} />;
}
