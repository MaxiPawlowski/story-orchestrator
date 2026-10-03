import { useState } from "react";
import { HOME_PAGE, newestSince, whatsNew, type FeatureWhere } from "@features/registry";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import { WhatsNewCard } from "./WhatsNewCard";

export interface WhatsNewHostProps {
  configured: boolean;
  authorView: boolean;
  onShowMe: (where: FeatureWhere) => void;
}

export default function WhatsNewHost({ configured, authorView, onShowMe }: WhatsNewHostProps) {
  const [lastSeen, setLastSeen] = useState(() => getGlobalSettings().help.lastSeenVersion);
  const features = whatsNew({ lastSeen, configured, authorView });
  const dismiss = () => setLastSeen(setGlobalSettings({ help: { lastSeenVersion: newestSince() } }).help.lastSeenVersion);
  return <WhatsNewCard features={features} homePage={HOME_PAGE} onShowMe={onShowMe} onDismiss={dismiss} />;
}
