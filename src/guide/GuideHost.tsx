import { HOME_PAGE } from "@features/guideLinks";
import { GUIDE_ASSETS, GUIDE_PAGES } from "./pages.generated";
import { GuideReader } from "./GuideReader";
import type { GuideTarget } from "./types";

export interface GuideHostProps {
  authorView: boolean;
  target: GuideTarget | null;
  onTargetSeen: () => void;
}

const assetSrc = (asset: string): string | undefined => GUIDE_ASSETS[asset];

export default function GuideHost({ authorView, target, onTargetSeen }: GuideHostProps) {
  return <GuideReader pages={GUIDE_PAGES} authorView={authorView} homePage={HOME_PAGE} target={target} onTargetSeen={onTargetSeen} assetSrc={assetSrc} />;
}
