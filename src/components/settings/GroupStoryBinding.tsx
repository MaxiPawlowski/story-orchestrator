import { useState } from "react";
import type { RuntimeSnapshot } from "@runtime/types";
import { groupStoryBinding, openGroup, setGroupStoryBinding } from "@runtime/groupStoryBindingHost";
import { GroupStoryBindingView, type GroupStoryBindingViewProps } from "./GroupStoryBindingView";

export default function GroupStoryBinding({ snapshot, busy }: { snapshot: RuntimeSnapshot; busy: boolean }) {
  const [, refresh] = useState(0);
  const [state, setState] = useState<{ status: GroupStoryBindingViewProps["status"]; reason?: string }>({ status: "idle" });
  const group = openGroup();
  if (!group) return null;
  const bind = (storyId: string | null) => {
    const evidence = setGroupStoryBinding(group.id, storyId);
    refresh((count) => count + 1);
    if (!evidence) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "saving" });
    void evidence.then((result) => setState(result.confirmed ? { status: "saved" } : { status: "unconfirmed", reason: result.reason }));
  };
  return (
    <GroupStoryBindingView
      groupName={group.name}
      boundStoryId={groupStoryBinding(group.id)}
      library={snapshot.library.map((story) => ({ id: story.id, title: story.title }))}
      busy={busy}
      status={state.status}
      reason={state.reason}
      onBind={bind}
    />
  );
}
