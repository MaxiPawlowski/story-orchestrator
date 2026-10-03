import { FieldLabel } from "./Field";

export interface GroupStoryBindingViewProps {
  groupName: string;
  boundStoryId: string | null;
  library: ReadonlyArray<{ id: string; title: string }>;
  busy: boolean;
  status: "idle" | "saving" | "saved" | "unconfirmed";
  reason?: string;
  onBind(storyId: string | null): void;
}

export function GroupStoryBindingView({ groupName, boundStoryId, library, busy, status, reason, onBind }: GroupStoryBindingViewProps) {
  const missing = boundStoryId !== null && !library.some((story) => story.id === boundStoryId);
  return (
    <div id="so-group-story" className="flex flex-col gap-1 text-sm">
      <FieldLabel htmlFor="so-group-story-select" label={`New chats in ${groupName} start with`}
        help="Each new, empty chat in this group starts playing this story. Chats already playing keep their own story." />
      <select
        id="so-group-story-select"
        value={boundStoryId ?? ""}
        disabled={busy || status === "saving"}
        onChange={(event) => onBind(event.target.value || null)}
      >
        <option value="">No story (choose in each chat)</option>
        {missing && <option value={boundStoryId}>{boundStoryId} (not in the library)</option>}
        {library.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
      </select>
      <div id="so-group-story-note" data-status={status} className="text-xs opacity-70">
        {missing
          ? "The bound story is no longer in the library, so a new chat here starts with none. Pick another or clear it."
          : "Applies only to a new, empty chat in this group. Chats already playing keep their own story."}
        {status === "saved" && " Saved."}
        {status === "unconfirmed" && ` Not confirmed: ${reason ?? "the settings save could not be verified"}.`}
      </div>
    </div>
  );
}

export default GroupStoryBindingView;
