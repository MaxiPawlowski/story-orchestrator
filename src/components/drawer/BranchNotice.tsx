import { useState } from "react";
import { branchNoticeText } from "@runtime/narrative";
import type { ChatIdentitySnapshot } from "@runtime/chatIdentity";

export interface BranchNoticeProps {
  identity: Extract<ChatIdentitySnapshot, { kind: "branch" }>;
  onContinue: () => Promise<unknown> | void;
}

// Non-blocking, and never adopts on its own. The player's one control.
export const BranchNotice = ({ onContinue }: BranchNoticeProps) => {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onContinue();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div id="so-branch-notice" className="flex flex-col gap-1 text-xs" role="status">
       <span>{branchNoticeText(null)}</span>
      <button id="so-branch-continue" type="button" className="menu_button self-start" disabled={busy} onClick={() => void run()}>
        Continue from here
      </button>
    </div>
  );
};

export default BranchNotice;
