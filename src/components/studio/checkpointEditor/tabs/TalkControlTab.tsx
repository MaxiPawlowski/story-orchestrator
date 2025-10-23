import React from "react";
import {
  type StoryDraft,
  type CheckpointDraft,
  type TalkControlDraft,
  type TalkControlCheckpointDraft,
  type TalkControlReplyDraft,
  type TalkControlReplyContentDraft,
} from "@utils/checkpoint-studio";
import type { TalkControlTrigger } from "@utils/story-schema";
import { TALK_CONTROL_TRIGGER_OPTIONS } from "../constants";
import { cloneTalkControlCheckpoint, cloneTalkControlReply } from "../talkControlUtils";

type Props = {
  draft: StoryDraft;
  checkpoint: CheckpointDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
};

const TalkControlTab: React.FC<Props> = ({ draft, checkpoint, setDraft }) => {
  const talkControl = draft.talkControl;
  const selectedCheckpointId = checkpoint.id;
  const checkpointTalkControl = talkControl?.checkpoints?.[selectedCheckpointId];
  const replies = checkpointTalkControl?.replies ?? [];
  
  // Get available roles for dropdowns
  const roleOptions = React.useMemo(() => {
    const roles = draft.roles && typeof draft.roles === "object" ? Object.keys(draft.roles) : [];
    return roles;
  }, [draft.roles]);

  const updateTalkControl = React.useCallback((updater: (current: TalkControlDraft | undefined) => TalkControlDraft | undefined) => {
    setDraft((prev) => {
      const next = updater(prev.talkControl);
      return { ...prev, talkControl: next };
    });
  }, [setDraft]);

  const updateCheckpointTalkControl = React.useCallback((checkpointId: string, updater: (current: TalkControlCheckpointDraft | undefined) => TalkControlCheckpointDraft | undefined) => {
    updateTalkControl((current) => {
      const base: TalkControlDraft = current
        ? { ...current, checkpoints: { ...(current.checkpoints ?? {}) } }
        : { checkpoints: {} };
      const existing = base.checkpoints[checkpointId];
      const nextCheckpoint = updater(existing ? cloneTalkControlCheckpoint(existing) : undefined);
      if (!nextCheckpoint || !nextCheckpoint.replies.length) {
        const { [checkpointId]: _removed, ...rest } = base.checkpoints;
        const nextConfig: TalkControlDraft = { ...base, checkpoints: rest };
        if (!nextConfig.defaults && !Object.keys(nextConfig.checkpoints).length) {
          return undefined;
        }
        return nextConfig;
      }
      return {
        ...base,
        checkpoints: {
          ...base.checkpoints,
          [checkpointId]: nextCheckpoint,
        },
      };
    });
  }, [updateTalkControl]);

  const patchReply = React.useCallback((replyIndex: number, updater: (reply: TalkControlReplyDraft) => TalkControlReplyDraft | null) => {
    updateCheckpointTalkControl(selectedCheckpointId, (current) => {
      const checkpointDraft = cloneTalkControlCheckpoint(current);
      if (!checkpointDraft.replies[replyIndex]) return checkpointDraft;
      const nextReply = updater(cloneTalkControlReply(checkpointDraft.replies[replyIndex]));
      if (!nextReply) {
        checkpointDraft.replies.splice(replyIndex, 1);
      } else {
        checkpointDraft.replies[replyIndex] = nextReply;
      }
      return checkpointDraft;
    });
  }, [selectedCheckpointId, updateCheckpointTalkControl]);

  const handleClearCheckpointTalkControl = React.useCallback(() => {
    updateCheckpointTalkControl(selectedCheckpointId, () => undefined);
  }, [selectedCheckpointId, updateCheckpointTalkControl]);

  const handleAddReply = React.useCallback(() => {
    updateCheckpointTalkControl(selectedCheckpointId, (current) => {
      const checkpointDraft = cloneTalkControlCheckpoint(current);
      checkpointDraft.replies.push({
        memberId: "",
        speakerId: "",
        enabled: true,
        trigger: "afterSpeak",
        probability: 100,
        content: { kind: "static", text: "" },
      });
      return checkpointDraft;
    });
  }, [selectedCheckpointId, updateCheckpointTalkControl]);

  const handleRemoveReply = React.useCallback((index: number) => {
    patchReply(index, () => null);
  }, [patchReply]);

  const handleReplyMemberIdChange = React.useCallback((index: number, value: string) => {
    patchReply(index, (reply) => ({ ...reply, memberId: value }));
  }, [patchReply]);

  const handleReplySpeakerIdChange = React.useCallback((index: number, value: string) => {
    patchReply(index, (reply) => ({ ...reply, speakerId: value }));
  }, [patchReply]);

  const handleReplyEnabledChange = React.useCallback((index: number, value: boolean) => {
    patchReply(index, (reply) => ({ ...reply, enabled: value }));
  }, [patchReply]);

  const handleReplyTriggerChange = React.useCallback((index: number, value: TalkControlTrigger) => {
    patchReply(index, (reply) => ({ ...reply, trigger: value }));
  }, [patchReply]);

  const handleReplyProbabilityChange = React.useCallback((index: number, raw: string) => {
    patchReply(index, (reply) => {
      const trimmed = raw.trim();
      if (!trimmed) return { ...reply, probability: 100 };
      const num = Number(trimmed);
      if (Number.isFinite(num)) {
        return { ...reply, probability: Math.min(100, Math.max(0, Math.floor(num))) };
      }
      return reply;
    });
  }, [patchReply]);

  const handleReplyContentKindChange = React.useCallback((index: number, kind: "static" | "llm") => {
    patchReply(index, (reply) => ({
      ...reply,
      content: kind === "static" ? { kind: "static", text: "" } : { kind: "llm", instruction: "" },
    }));
  }, [patchReply]);

  const handleReplyContentChange = React.useCallback((index: number, value: string) => {
    patchReply(index, (reply) => {
      if (reply.content.kind === "static") {
        return { ...reply, content: { kind: "static", text: value } };
      }
      return { ...reply, content: { kind: "llm", instruction: value } };
    });
  }, [patchReply]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-300">
          Configure automated responses for <span className="font-semibold text-slate-100">{checkpoint.name || checkpoint.id}</span>.
        </div>
        <div className="flex flex-wrap gap-2">
          {replies.length ? (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-red-300 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
              onClick={handleClearCheckpointTalkControl}
            >
              Clear All
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
            onClick={handleAddReply}
          >
            + Add Reply
          </button>
        </div>
      </div>

      {replies.length ? (
        <div className="space-y-4">
          {replies.map((reply, idx) => {
            const triggerLabel = TALK_CONTROL_TRIGGER_OPTIONS.find((opt) => opt.key === reply.trigger)?.label ?? reply.trigger;

            return (
              <div key={`talk-control-reply-${idx}`} className="space-y-3 rounded border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Reply {idx + 1}</div>
                    <div className="text-[11px] text-slate-400">
                      Trigger: <span className="text-slate-300">{triggerLabel}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                      <input
                        type="checkbox"
                        className="rounded border-slate-600 bg-slate-900 text-slate-200 focus:ring-slate-600"
                        checked={reply.enabled}
                        onChange={(e) => handleReplyEnabledChange(idx, e.target.checked)}
                      />
                      <span>Enabled</span>
                    </label>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-red-300 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                      onClick={() => handleRemoveReply(idx)}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Trigger Event</span>
                  <select
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={reply.trigger}
                    onChange={(e) => handleReplyTriggerChange(idx, e.target.value as TalkControlTrigger)}
                  >
                    {TALK_CONTROL_TRIGGER_OPTIONS.map(({ key, label }) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                {reply.trigger === "afterSpeak" ? (
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <span>Trigger After Character (Optional)</span>
                    <select
                      className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                      value={reply.memberId}
                      onChange={(e) => handleReplyMemberIdChange(idx, e.target.value)}
                    >
                      <option value="">Any Character</option>
                      {roleOptions.map((roleKey) => (
                        <option key={roleKey} value={roleKey}>
                          {draft.roles?.[roleKey] || roleKey}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] text-slate-400">
                      Select "Any Character" to trigger after anyone speaks, or choose a specific character.
                    </div>
                  </label>
                ) : null}

                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Speaking Character (Who Replies)</span>
                  <select
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={reply.speakerId}
                    onChange={(e) => handleReplySpeakerIdChange(idx, e.target.value)}
                  >
                    <option value="">-- Select Character --</option>
                    {roleOptions.map((roleKey) => (
                      <option key={roleKey} value={roleKey}>
                        {draft.roles?.[roleKey] || roleKey}
                      </option>
                    ))}
                  </select>
                  {roleOptions.length === 0 && (
                    <div className="text-[11px] text-amber-400">
                      ⚠️ No story roles defined. Add roles in the Story Details section.
                    </div>
                  )}
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Probability (0-100)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={reply.probability}
                    onChange={(e) => handleReplyProbabilityChange(idx, e.target.value)}
                  />
                </label>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span>Content Type</span>
                    <select
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 focus:border-transparent focus:outline-none focus:ring-slate-600"
                      value={reply.content.kind}
                      onChange={(e) => handleReplyContentKindChange(idx, e.target.value as "static" | "llm")}
                    >
                      <option value="static">Static Text</option>
                      <option value="llm">LLM Instruction</option>
                    </select>
                  </div>
                  {reply.content.kind === "static" ? (
                    <textarea
                      className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-slate-600"
                      rows={3}
                      value={reply.content.text}
                      onChange={(e) => handleReplyContentChange(idx, e.target.value)}
                      placeholder="Static response text (macros allowed)"
                    />
                  ) : (
                    <textarea
                      className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-slate-600"
                      rows={3}
                      value={reply.content.instruction}
                      onChange={(e) => handleReplyContentChange(idx, e.target.value)}
                      placeholder="LLM-generated response instruction"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded border border-slate-800 bg-slate-950/30 p-6 text-center text-sm text-slate-400">
          No replies configured. Click "Add Reply" to create automated responses.
        </div>
      )}
    </div>
  );
};

export default TalkControlTab;

