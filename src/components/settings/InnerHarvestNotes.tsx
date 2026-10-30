import type { RuntimeSnapshot } from "@runtime/types";
import { SILENT_REPLY_WINDOW } from "@runtime/thinkingSilence";
import { StatusText } from "@components/ui/StatusText";

export const InnerHarvestNotes = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const settings = snapshot.memory?.settings;
  return <>
    {snapshot.ui.authorView && settings?.harvestReasoning === true && !settings.epistemicLedgerCapable ? (
      <div id="so-inner-harvest-idle" className="text-xs opacity-70">Idle: knowledge tracking is off for the memory model.</div>
    ) : null}
    {snapshot.thinkingSilent ? (
      <StatusText as="div" tone="warn" id="so-inner-harvest-silent">Nothing to read: the last {SILENT_REPLY_WINDOW} replies carry no reasoning, so the model is not thinking.</StatusText>
    ) : null}
  </>;
};
