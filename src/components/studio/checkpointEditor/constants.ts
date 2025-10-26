import {
  type AuthorNotePosition,
  type AuthorNoteRole,
  type TalkControlTrigger,
} from "@utils/story-schema";

export const AUTHOR_NOTE_POSITION_OPTIONS: Array<{ value: "" | AuthorNotePosition; label: string }> = [
  { value: "", label: "Story default" },
  { value: "before", label: "Before chat" },
  { value: "chat", label: "Within chat" },
  { value: "after", label: "After chat" },
];

export const AUTHOR_NOTE_ROLE_OPTIONS: Array<{ value: "" | AuthorNoteRole; label: string }> = [
  { value: "", label: "Story default" },
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
];

export const TALK_CONTROL_TRIGGER_OPTIONS: Array<{ key: TalkControlTrigger; label: string }> = [
  { key: "afterSpeak", label: "After X Speaks" },
  { key: "beforeArbiter", label: "Before Arbiter eval" },
  { key: "afterArbiter", label: "After Arbiter eval" },
  { key: "onEnter", label: "On Checkpoint Activation" },
];

