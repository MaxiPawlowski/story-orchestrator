import { useState } from "react";
import type { StoryFeatureId } from "@engine/featurePolicy";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RuntimeSnapshot } from "@runtime/types";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { Section } from "@components/ui/Section";
import type { SettingsHost } from "../settings/SettingsPanel";
import { CheckRow } from "../settings/Field";
import { FeaturesPage } from "./FeaturesPage";
import type { WorkspaceNavigate } from "./WorkspaceShell";

const StoryChoice = lazyRetry(() => import("../settings/StoryGroup").then((module) => ({ default: module.StoryChoice })));
const GroupStoryBinding = lazyRetry(() => import("../settings/GroupStoryBinding"));
const MakeGroupCard = lazyRetry(() => import("../settings/MakeGroupCard"));

export interface ChatSettingsPageProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  host: SettingsHost;
  expanded?: StoryFeatureId;
  navigate: WorkspaceNavigate;
  profileName?: (profileId: string) => string | null;
}

export const AUTHOR_VIEW_DESCRIPTION = "Shows gates, upcoming turning points and what characters are hiding, for this chat only. It spoils the story for a player.";

export const ChatSettingsPage = ({ snapshot, manager, host, expanded, navigate, profileName }: ChatSettingsPageProps) => {
  const [busy, setBusy] = useState(false);
  return <div className="so-settings-page" data-so="chat-settings">
    <Section id="so-chat-story-section" title="Story" level={2} description="Which story this chat plays, and what new chats in this group start with.">
      <Lazy fallback={null}><StoryChoice snapshot={snapshot} manager={manager} busy={busy} setBusy={setBusy} /></Lazy>
      {snapshot.noGroup && host.makeGroup && <Lazy fallback={null}><MakeGroupCard view={snapshot.noGroup} wizardOn={snapshot.copilot.enabled} onMakeGroup={host.makeGroup}
        onFixWithWizard={(storyId, missing) => host.fixGroupWithWizard?.(storyId, missing)} /></Lazy>}
      <Lazy fallback={null}><GroupStoryBinding snapshot={snapshot} busy={busy} /></Lazy>
    </Section>
    <Section id="so-chat-features" title="Features in this chat" level={2}
      description="Changes apply only to this chat. Defaults for every chat are in Settings › Features; the story itself is edited in Studio.">
      <FeaturesPage snapshot={snapshot} manager={manager} scope="chat" expanded={expanded} navigate={navigate} profileName={profileName} />
    </Section>
    <Section id="so-chat-author" title="Author view" level={2}>
      <CheckRow id="so-author-view-switch" label="Author view in this chat" description={AUTHOR_VIEW_DESCRIPTION} checked={snapshot.ui.authorView}
        scope="chat" onChange={(on) => host.setAuthorView ? host.setAuthorView(on) : manager.setUiSettings({ authorView: on })} />
    </Section>
  </div>;
};

export default ChatSettingsPage;
