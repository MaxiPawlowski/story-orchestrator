import { useState } from "react";
import type { MakeGroupOutcome } from "@runtime/makeGroup";
import type { NoGroupView } from "@runtime/noGroup";

export interface MakeGroupCardProps {
  view: NoGroupView;
  id?: string;
  wizardOn: boolean;
  onMakeGroup(storyId: string): Promise<MakeGroupOutcome>;
  onFixWithWizard(storyId: string, missing: string[]): void;
}

export const MAKE_GROUP_LABEL = "Make a group for this story";

export default function MakeGroupCard({ view, id = "so-make-group", wizardOn, onMakeGroup, onFixWithWizard }: MakeGroupCardProps) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<MakeGroupOutcome | null>(null);
  const storyId = view.storyId;
  const make = async () => {
    if (!storyId) return;
    setBusy(true);
    try {
      setOutcome(await onMakeGroup(storyId));
    } finally {
      setBusy(false);
    }
  };
  const missing = outcome && !outcome.ok && outcome.reason === "missing" ? outcome.missing ?? [] : [];
  return (
    <div id={id} data-so="make-group" role="status" className="so-task-card flex flex-col gap-1 text-sm">
      <div className="font-medium">{view.notice}</div>
      <div className="text-xs opacity-80">
        {view.storyTitle ? `"${view.storyTitle}" needs a group to play in. ` : ""}A group holds the story's cast, so each character keeps their own memory and voice.
      </div>
      {storyId && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-so="make-group-button" className="menu_button" disabled={busy} onClick={() => void make()}>{MAKE_GROUP_LABEL}</button>
        </div>
      )}
      {outcome && <div data-so="make-group-outcome" data-ok={outcome.ok} className={`text-xs ${outcome.ok ? "opacity-80" : "so-warning-text"}`}>{outcome.message}</div>}
      {storyId && missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-so="make-group-fix" className="menu_button" disabled={!wizardOn}
            title={wizardOn ? "Open the wizard on the provisioning step, pre-filled with the missing cards." : "Turn on the wizard under Authoring first."}
            onClick={() => onFixWithWizard(storyId, missing)}>Fix with wizard</button>
        </div>
      )}
    </div>
  );
}
