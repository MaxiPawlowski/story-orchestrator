import { useEffect, useRef, useState } from "react";
import type { BriefingView } from "@engine/index";
import { briefingDue } from "@runtime/briefing";
import { onBriefingRequest } from "@runtime/briefingRequest";
import { beforeYouStart } from "@runtime/repair";
import type { UiSettingsPatch } from "@runtime/settingsControl";
import type { RuntimeSnapshot } from "@runtime/types";
import { BriefingModal } from "./BriefingModal";
import type { ChooseIdentity } from "./PlayerSetupPane";

export interface BriefingHostProps {
  snapshot: RuntimeSnapshot;
  setUi: (patch: UiSettingsPatch) => void;
  onboardingSeen: () => boolean;
  markOnboardingSeen: () => void;
  chooseIdentity?: ChooseIdentity;
}

type Opened =
  | { kind: "due" | "story" | "identity"; storyId: string; onboarding: boolean }
  | { kind: "preview"; view: BriefingView | null; chapter: BriefingView | null };

export const blockingLines = (snapshot: RuntimeSnapshot): string[] => beforeYouStart(snapshot).map((step) => step.consequence);

export const identityDue = (snapshot: RuntimeSnapshot): boolean => Boolean(snapshot.playerSetup?.pending && snapshot.playerSetup.needsPane);

export const BriefingHost = ({ snapshot, setUi, onboardingSeen, markOnboardingSeen, chooseIdentity }: BriefingHostProps) => {
  const [opened, setOpened] = useState<Opened | null>(null);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const dismissed = useRef<string | null>(null);
  const state = snapshot.briefing ?? null;
  const setup = snapshot.playerSetup ?? null;
  const blocks = blockingLines(snapshot);
  const due = briefingDue(state, blocks.length) || identityDue(snapshot);
  const storyId = state?.storyId ?? setup?.storyId ?? null;

  useEffect(() => onBriefingRequest((request) => {
    if (request.kind === "preview") return setOpened({ kind: "preview", view: request.view, chapter: request.chapter ?? null });
    const current = latest.current;
    if (request.kind === "identity" && current.playerSetup) return setOpened({ kind: "identity", storyId: current.playerSetup.storyId, onboarding: false });
    if (current.briefing?.view) setOpened({ kind: "story", storyId: current.briefing.storyId, onboarding: false });
  }), []);

  useEffect(() => {
    if (!due) dismissed.current = null;
    if (due && storyId && !opened && dismissed.current !== storyId) {
      setOpened({ kind: "due", storyId, onboarding: Boolean(state?.enabled && state.view) && !onboardingSeen() });
    }
  }, [due, storyId, opened, state, onboardingSeen]);

  useEffect(() => {
    if (opened && opened.kind !== "preview" && opened.storyId !== storyId) setOpened(null);
  }, [opened, storyId]);

  if (!opened) return null;
  if (opened.kind === "preview") return <BriefingModal briefing={opened.view} chapter={opened.chapter} onClose={() => setOpened(null)} />;

  const close = ({ dontShow }: { dontShow: boolean }) => {
    dismissed.current = opened.storyId;
    if (opened.onboarding) markOnboardingSeen();
    if (latest.current.playerSetup?.pending && chooseIdentity) void chooseIdentity({ choice: "skip" });
    if (opened.kind !== "identity" && state?.pending) setUi({ briefingSeen: true, ...(dontShow ? { briefing: false } : {}) });
    else if (dontShow) setUi({ briefing: false });
    setOpened(null);
  };
  const showBriefing = opened.kind === "story" || (opened.kind === "due" && Boolean(state?.enabled));
  const showIdentity = Boolean(setup && chooseIdentity && (opened.kind === "identity" || (opened.kind === "due" && setup.needsPane && setup.record)));
  return (
    <BriefingModal
      briefing={showBriefing ? state?.view ?? null : null}
      blocks={blocks}
      onboarding={opened.onboarding}
      optOut={opened.kind === "due" && showBriefing}
      identity={showIdentity && setup && chooseIdentity ? { view: setup, rechoose: opened.kind === "identity", onChoose: chooseIdentity } : null}
      onClose={close}
    />
  );
};

export default BriefingHost;
