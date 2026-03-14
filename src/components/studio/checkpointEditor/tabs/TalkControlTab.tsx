import React, { useCallback, useMemo } from "react";
import {
  type StoryDraft,
  type CheckpointDraft,
  type TalkControlReplyDraft,
} from "@utils/checkpoint-studio";
import type { TalkControlTrigger } from "@utils/story-schema";
import { PLAYER_SPEAKER_ID, PLAYER_SPEAKER_LABEL } from "@constants/main";
import { TALK_CONTROL_TRIGGER_OPTIONS } from "../constants";
import { cloneTalkControlReply } from "../talkControlUtils";
import HelpTooltip from "../../HelpTooltip";

type Props = {
  draft: StoryDraft;
  checkpoint: CheckpointDraft;
  updateCheckpoint: (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => void;
};

const TalkControlTab: React.FC<Props> = ({ draft, checkpoint, updateCheckpoint }) => {
  const replies = checkpoint.talk_control ?? [];

  const roleOptions = useMemo(() => {
    const roles = draft.roles && typeof draft.roles === "object" ? Object.keys(draft.roles) : [];
    return roles;
  }, [draft.roles]);

  const patchReply = useCallback((replyIndex: number, updater: (reply: TalkControlReplyDraft) => TalkControlReplyDraft | null) => {
    updateCheckpoint(checkpoint.id, (cp) => {
      const next = [...(cp.talk_control ?? [])];
      if (!next[replyIndex]) return cp;
      const result = updater(cloneTalkControlReply(next[replyIndex]));
      if (!result) {
        next.splice(replyIndex, 1);
      } else {
        next[replyIndex] = result;
      }
      return { ...cp, talk_control: next.length ? next : undefined };
    });
  }, [checkpoint.id, updateCheckpoint]);

  const handleClearCheckpointTalkControl = useCallback(() => {
    updateCheckpoint(checkpoint.id, (cp) => ({ ...cp, talk_control: undefined }));
  }, [checkpoint.id, updateCheckpoint]);

  const handleAddReply = useCallback(() => {
    updateCheckpoint(checkpoint.id, (cp) => {
      const next = [...(cp.talk_control ?? [])];
      next.push({
        memberId: "",
        speakerId: "",
        enabled: true,
        trigger: "afterSpeak",
        probability: 100,
        maxTriggers: 1,
        content: { kind: "static", text: "" },
      });
      return { ...cp, talk_control: next };
    });
  }, [checkpoint.id, updateCheckpoint]);

  const handleRemoveReply = useCallback((index: number) => {
    patchReply(index, () => null);
  }, [patchReply]);

  const handleReplyMemberIdChange = useCallback((index: number, value: string) => {
    patchReply(index, (reply) => ({ ...reply, memberId: value }));
  }, [patchReply]);

  const handleReplySpeakerIdChange = useCallback((index: number, value: string) => {
    patchReply(index, (reply) => ({ ...reply, speakerId: value }));
  }, [patchReply]);

  const handleReplyEnabledChange = useCallback((index: number, value: boolean) => {
    patchReply(index, (reply) => ({ ...reply, enabled: value }));
  }, [patchReply]);

  const handleReplyTriggerChange = useCallback((index: number, value: TalkControlTrigger) => {
    patchReply(index, (reply) => ({ ...reply, trigger: value }));
  }, [patchReply]);

  const handleReplyProbabilityChange = useCallback((index: number, raw: string) => {
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

  const handleReplyMaxTriggersChange = useCallback((index: number, raw: string) => {
    patchReply(index, (reply) => {
      const trimmed = raw.trim();
      if (!trimmed) return { ...reply, maxTriggers: undefined };
      const num = Number(trimmed);
      if (Number.isFinite(num) && num >= 1) {
        return { ...reply, maxTriggers: Math.floor(num) };
      }
      return reply;
    });
  }, [patchReply]);

  const handleReplyContentKindChange = useCallback((index: number, kind: "static" | "llm") => {
    patchReply(index, (reply) => ({
      ...reply,
      content: kind === "static" ? { kind: "static", text: "" } : { kind: "llm", instruction: "" },
    }));
  }, [patchReply]);

  const handleReplyContentChange = useCallback((index: number, value: string) => {
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
        <div className="text-xs st-muted">
          Configure automated responses for <span className="font-semibold st-strong">{checkpoint.name || checkpoint.id}</span>.
        </div>
        <div className="flex flex-wrap gap-2">
          {replies.length ? (
            <button
              type="button"
              className="st-button danger"
              onClick={handleClearCheckpointTalkControl}
            >
              Clear All
            </button>
          ) : null}
          <button
            type="button"
            className="st-button primary"
            onClick={handleAddReply}
          >
            + Add Reply
          </button>
        </div>
      </div>

      {replies.length ? (
        <div className="space-y-4">
          {replies.map((reply, idx) => {

            return (
              <div key={`talk-control-reply-${idx}`} className="space-y-3 st-subpanel p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold st-strong">Reply {idx + 1}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-[11px] st-muted">
                      <input
                        type="checkbox"
                        className="rounded st-border st-bg-active st-text-active"
                        checked={reply.enabled}
                        onChange={(e) => handleReplyEnabledChange(idx, e.target.checked)}
                      />
                      <span>Enabled</span>
                    </label>
                    <button
                      type="button"
                      className="st-button danger"
                      onClick={() => handleRemoveReply(idx)}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="inline-flex items-center gap-1">
                      Trigger Event
                      <HelpTooltip title="Select when this reply should be eligible to fire." />
                    </span>
                    <select
                      className="text_pole st-input w-full"
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
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="inline-flex items-center gap-1">
                        Trigger After Character
                        <HelpTooltip title="Who needs to speak for this reply to trigger." />
                      </span>
                      <select
                        className="text_pole st-input w-full"
                        value={reply.speakerId}
                        onChange={(e) => handleReplySpeakerIdChange(idx, e.target.value)}
                      >
                        <option value="">Any Character</option>
                        <option value={PLAYER_SPEAKER_ID}>{PLAYER_SPEAKER_LABEL}</option>
                        {roleOptions.map((roleKey) => (
                          <option key={roleKey} value={roleKey}>
                            {draft.roles?.[roleKey] || roleKey}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div />
                  )}
                </div>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="inline-flex items-center gap-1">
                    Speaking Character (Who Replies)
                    <HelpTooltip title="Choose who delivers the automated response." />
                  </span>
                  <select
                    className="text_pole st-input w-full"
                    value={reply.memberId}
                    onChange={(e) => handleReplyMemberIdChange(idx, e.target.value)}
                  >
                    <option value="">-- Select Character --</option>
                    {roleOptions.map((roleKey) => (
                      <option key={roleKey} value={roleKey}>
                        {draft.roles?.[roleKey] || roleKey}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="inline-flex items-center gap-1">
                      Probability (0-100)
                      <HelpTooltip title="Control the likelihood of this reply being selected." />
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="text_pole st-input w-full"
                      value={reply.probability}
                      onChange={(e) => handleReplyProbabilityChange(idx, e.target.value)}
                    />
                  </label>

                  {reply.trigger !== "onEnter" && (
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="inline-flex items-center gap-1">
                        Max Triggers
                        <HelpTooltip title="Limit how many times this reply can trigger during the checkpoint. Leave empty for unlimited." />
                      </span>
                      <input
                        type="number"
                        min={1}
                        className="text_pole st-input w-full"
                        value={reply.maxTriggers ?? ""}
                        placeholder="Unlimited"
                        onChange={(e) => handleReplyMaxTriggersChange(idx, e.target.value)}
                      />
                    </label>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1">
                      Content Type
                      <HelpTooltip title="Choose static canned text or LLM instructions to generate replies dynamically." />
                    </span>
                    <select
                      className="text_pole st-input"
                      value={reply.content.kind}
                      onChange={(e) => handleReplyContentKindChange(idx, e.target.value as "static" | "llm")}
                    >
                      <option value="static">Static Text</option>
                      <option value="llm">LLM Instruction</option>
                    </select>
                  </div>
                  {reply.content.kind === "static" ? (
                    <textarea
                      className="text_pole textarea_compact st-input w-full resize-y"
                      rows={3}
                      value={reply.content.text}
                      onChange={(e) => handleReplyContentChange(idx, e.target.value)}
                      placeholder="Static response text (macros allowed)"
                    />
                  ) : (
                    <textarea
                      className="text_pole textarea_compact st-input w-full resize-y"
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
        <div className="st-subpanel p-6 text-center text-sm st-muted">
          No replies configured. Click "Add Reply" to create automated responses.
        </div>
      )}
    </div>
  );
};

export default TalkControlTab;
