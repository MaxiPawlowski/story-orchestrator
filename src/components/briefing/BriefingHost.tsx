import { useEffect, useRef, useState } from "react";
import type { BriefingView } from "@engine/index";
import { briefingDue } from "@runtime/briefing";
import { onBriefingRequest } from "@runtime/briefingRequest";
import { beforeYouStart } from "@runtime/repair";
import type { UiSettingsPatch } from "@runtime/settingsControl";
import type { RuntimeSnapshot } from "@runtime/types";
import { BriefingModal } from "./BriefingModal";

export interface BriefingHostProps {
  snapshot: RuntimeSnapshot;
  setUi: (patch: UiSettingsPatch) => void;
  onboardingSeen: () => boolean;
  markOnboardingSeen: () => void;
}

type Opened =
  | { kind: "due" | "story"; storyId: string; onboarding: boolean }
  | { kind: "preview"; view: BriefingView | null; chapter: BriefingView | null };

export const blockingLines = (snapshot: RuntimeSnapshot): string[] => beforeYouStart(snapshot).map((step) => step.consequence);

export const BriefingHost = ({ snapshot, setUi, onboardingSeen, markOnboardingSeen }: BriefingHostProps) => {
  const [opened, setOpened] = useState<Opened | null>(null);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const dismissed = useRef<string | null>(null);
  const state = snapshot.briefing ?? null;
  const blocks = blockingLines(snapshot);
  const due = briefingDue(state, blocks.length);
  const storyId = state?.storyId ?? null;

  useEffect(() => onBriefingRequest((request) => {
    if (request.kind === "preview") return setOpened({ kind: "preview", view: request.view, chapter: request.chapter ?? null });
    const current = latest.current.briefing;
    if (current?.view) setOpened({ kind: "story", storyId: current.storyId, onboarding: false });
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
    if (state?.pending) setUi({ briefingSeen: true, ...(dontShow ? { briefing: false } : {}) });
    else if (dontShow) setUi({ briefing: false });
    setOpened(null);
  };
  const showBriefing = opened.kind === "story" || Boolean(state?.enabled);
  return (
    <BriefingModal
      briefing={showBriefing ? state?.view ?? null : null}
      blocks={blocks}
      onboarding={opened.onboarding}
      optOut={opened.kind === "due" && showBriefing}
      onClose={close}
    />
  );
};

export default BriefingHost;
