import React from "react";
import {
  type StoryDraft,
  type CheckpointDraft,
  type TalkControlDraft,
  type TalkControlCheckpointDraft,
  type TalkControlMemberDraft,
  type TalkControlAutoReplyDraft,
} from "@utils/checkpoint-studio";
import type { TalkControlTrigger } from "@utils/story-schema";
import { TALK_CONTROL_TRIGGER_OPTIONS } from "../constants";
import { cloneTalkControlCheckpoint, cloneTalkControlMember } from "../talkControlUtils";

type Props = {
  draft: StoryDraft;
  checkpoint: CheckpointDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
};

const TalkControlTab: React.FC<Props> = ({ draft, checkpoint, setDraft }) => {
  const talkControl = draft.talkControl;
  const selectedCheckpointId = checkpoint.id;
  const talkControlEnabled = Boolean(talkControl?.enabled);
  const checkpointTalkControl = talkControl?.checkpoints?.[selectedCheckpointId];
  const checkpointMembers = checkpointTalkControl?.members ?? [];

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
        : { enabled: true, checkpoints: {} };
      const existing = base.checkpoints[checkpointId];
      const nextCheckpoint = updater(existing ? cloneTalkControlCheckpoint(existing) : undefined);
      if (!nextCheckpoint || !nextCheckpoint.members.length) {
        const { [checkpointId]: _removed, ...rest } = base.checkpoints;
        const nextConfig: TalkControlDraft = { ...base, checkpoints: rest };
        if (!nextConfig.enabled && !nextConfig.defaults && !Object.keys(nextConfig.checkpoints).length) {
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

  const patchMember = React.useCallback((memberIndex: number, updater: (member: TalkControlMemberDraft) => TalkControlMemberDraft | null) => {
    updateCheckpointTalkControl(selectedCheckpointId, (current) => {
      const checkpointDraft = cloneTalkControlCheckpoint(current);
      if (!checkpointDraft.members[memberIndex]) return checkpointDraft;
      const nextMember = updater(cloneTalkControlMember(checkpointDraft.members[memberIndex]));
      if (!nextMember) {
        checkpointDraft.members.splice(memberIndex, 1);
      } else {
        checkpointDraft.members[memberIndex] = nextMember;
      }
      return checkpointDraft;
    });
  }, [selectedCheckpointId, updateCheckpointTalkControl]);

  const handleEnableTalkControl = React.useCallback(() => {
    updateTalkControl((current) => {
      const base: TalkControlDraft = current ?? { enabled: true, checkpoints: {} };
      return { ...base, enabled: true };
    });
  }, [updateTalkControl]);

  const handleClearCheckpointTalkControl = React.useCallback(() => {
    updateCheckpointTalkControl(selectedCheckpointId, () => undefined);
  }, [selectedCheckpointId, updateCheckpointTalkControl]);

  const handleAddMember = React.useCallback(() => {
    const defaults = talkControl?.defaults;
    updateCheckpointTalkControl(selectedCheckpointId, (current) => {
      const checkpointDraft = cloneTalkControlCheckpoint(current);
      checkpointDraft.members.push({
        memberId: "",
        enabled: true,
        probabilities: {},
        cooldownTurns: defaults?.cooldownTurns,
        maxPerTurn: defaults?.maxPerTurn ?? 1,
        maxCharsPerAuto: defaults?.maxCharsPerAuto ?? 600,
        sendAsQuiet: defaults?.sendAsQuiet,
        forceSpeaker: defaults?.forceSpeaker ?? true,
        autoReplies: [{ kind: "static", weight: 1, text: "" }],
      });
      return checkpointDraft;
    });
  }, [selectedCheckpointId, updateCheckpointTalkControl, talkControl?.defaults]);

  const handleRemoveMember = React.useCallback((index: number) => {
    patchMember(index, () => null);
  }, [patchMember]);

  const handleMemberIdChange = React.useCallback((index: number, value: string) => {
    patchMember(index, (member) => ({ ...member, memberId: value }));
  }, [patchMember]);

  const handleMemberEnabledChange = React.useCallback((index: number, value: boolean) => {
    patchMember(index, (member) => ({ ...member, enabled: value }));
  }, [patchMember]);

  const handleMemberNumberChange = React.useCallback((index: number, key: "cooldownTurns" | "maxPerTurn" | "maxCharsPerAuto", raw: string) => {
    patchMember(index, (member) => {
      const next = { ...member } as TalkControlMemberDraft & Record<string, unknown>;
      const trimmed = raw.trim();
      if (!trimmed) {
        delete next[key];
      } else {
        const num = Number(trimmed);
        if (Number.isFinite(num)) {
          const min = key === "maxPerTurn" ? 1 : key === "maxCharsPerAuto" ? 1 : 0;
          next[key] = Math.max(min, Math.floor(num));
        }
      }
      return next as TalkControlMemberDraft;
    });
  }, [patchMember]);

  const handleMemberFlagChange = React.useCallback((index: number, key: "sendAsQuiet" | "forceSpeaker", value: string) => {
    patchMember(index, (member) => {
      const next = { ...member } as TalkControlMemberDraft & Record<string, unknown>;
      if (!value) {
        delete next[key];
      } else {
        next[key] = value === "true";
      }
      return next as TalkControlMemberDraft;
    });
  }, [patchMember]);

  const handleProbabilityChange = React.useCallback((index: number, trigger: TalkControlTrigger, raw: string) => {
    patchMember(index, (member) => {
      const probabilities = { ...(member.probabilities ?? {}) };
      const trimmed = raw.trim();
      if (!trimmed) {
        delete probabilities[trigger];
      } else {
        const num = Number(trimmed);
        if (Number.isFinite(num)) {
          const rounded = Math.round(num);
          if (rounded <= 0) {
            delete probabilities[trigger];
          } else {
            probabilities[trigger] = Math.min(100, rounded);
          }
        }
      }
      return { ...member, probabilities };
    });
  }, [patchMember]);

  const handleAddAutoReply = React.useCallback((memberIndex: number, kind: "static" | "llm") => {
    patchMember(memberIndex, (member) => {
      const replies = member.autoReplies.map((reply) => ({ ...reply })) as TalkControlAutoReplyDraft[];
      replies.push(kind === "llm" ? { kind: "llm", weight: 1, instruction: "" } : { kind: "static", weight: 1, text: "" });
      return { ...member, autoReplies: replies };
    });
  }, [patchMember]);

  const handleAutoReplyKindChange = React.useCallback((memberIndex: number, replyIndex: number, kind: "static" | "llm") => {
    patchMember(memberIndex, (member) => {
      const replies = member.autoReplies.map((reply, idx) => {
        if (idx !== replyIndex) return { ...reply } as TalkControlAutoReplyDraft;
        if (reply.kind === kind) return { ...reply } as TalkControlAutoReplyDraft;
        return (kind === "static"
          ? { kind: "static", weight: reply.weight ?? 1, text: "" }
          : { kind: "llm", weight: reply.weight ?? 1, instruction: "" }) as TalkControlAutoReplyDraft;
      });
      return { ...member, autoReplies: replies as TalkControlAutoReplyDraft[] };
    });
  }, [patchMember]);

  const handleAutoReplyWeightChange = React.useCallback((memberIndex: number, replyIndex: number, raw: string) => {
    patchMember(memberIndex, (member) => {
      const replies = member.autoReplies.map((reply, idx) => {
        if (idx !== replyIndex) return { ...reply } as TalkControlAutoReplyDraft;
        const trimmed = raw.trim();
        const num = Number(trimmed);
        const weight = Number.isFinite(num) ? Math.max(1, Math.floor(num)) : reply.weight ?? 1;
        return { ...reply, weight } as TalkControlAutoReplyDraft;
      });
      return { ...member, autoReplies: replies as TalkControlAutoReplyDraft[] };
    });
  }, [patchMember]);

  const handleAutoReplyContentChange = React.useCallback((memberIndex: number, replyIndex: number, value: string) => {
    patchMember(memberIndex, (member) => {
      const replies = member.autoReplies.map((reply, idx) => {
        if (idx !== replyIndex) return { ...reply } as TalkControlAutoReplyDraft;
        if (reply.kind === "static") {
          return { ...reply, text: value } as TalkControlAutoReplyDraft;
        }
        return { ...reply, instruction: value } as TalkControlAutoReplyDraft;
      });
      return { ...member, autoReplies: replies as TalkControlAutoReplyDraft[] };
    });
  }, [patchMember]);

  const handleRemoveAutoReply = React.useCallback((memberIndex: number, replyIndex: number) => {
    patchMember(memberIndex, (member) => {
      const replies = member.autoReplies.filter((_, idx) => idx !== replyIndex) as TalkControlAutoReplyDraft[];
      return { ...member, autoReplies: replies.length ? replies : [{ kind: "static", weight: 1, text: "" }] };
    });
  }, [patchMember]);

  return (
    <div className="space-y-3">
      {!talkControlEnabled ? (
        <div className="rounded border border-slate-700 bg-slate-900/40 px-3 py-4 text-xs text-slate-300">
          <div className="mb-2">Talk control automation is currently disabled for this story.</div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
            onClick={handleEnableTalkControl}
          >
            Enable Talk Control
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-300">
              Configure automated responses for <span className="font-semibold text-slate-100">{checkpoint.name || checkpoint.id}</span>.
            </div>
            <div className="flex flex-wrap gap-2">
              {checkpointMembers.length ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-red-300 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                  onClick={handleClearCheckpointTalkControl}
                >
                  Clear Checkpoint
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                onClick={handleAddMember}
              >
                + Add Member
              </button>
            </div>
          </div>

          {checkpointMembers.length ? (
            <div className="space-y-4">
              {checkpointMembers.map((member, idx) => {
                const sendAsQuietValue = member.sendAsQuiet === undefined ? "" : member.sendAsQuiet ? "true" : "false";
                const forceSpeakerValue = member.forceSpeaker === undefined ? "" : member.forceSpeaker ? "true" : "false";
                return (
                  <div key={`talk-control-${idx}`} className="space-y-3 rounded border border-slate-800 bg-slate-950/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">Member {idx + 1}</div>
                        <div className="text-[11px] text-slate-400">Use exact participant names from the story roles or group chat.</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                          <input
                            type="checkbox"
                            className="rounded border-slate-600 bg-slate-900 text-slate-200 focus:ring-slate-600"
                            checked={member.enabled}
                            onChange={(e) => handleMemberEnabledChange(idx, e.target.checked)}
                          />
                          <span>Enabled</span>
                        </label>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-red-300 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                          onClick={() => handleRemoveMember(idx)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <label className="flex flex-col gap-1 text-xs text-slate-300">
                      <span>Member Name / Role</span>
                      <input
                        className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                        value={member.memberId}
                        onChange={(e) => handleMemberIdChange(idx, e.target.value)}
                        placeholder="Character name or story role..."
                      />
                    </label>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <label className="flex flex-col gap-1 text-xs text-slate-300">
                        <span>Cooldown Turns</span>
                        <input
                          type="number"
                          min={0}
                          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                          value={member.cooldownTurns ?? ""}
                          onChange={(e) => handleMemberNumberChange(idx, "cooldownTurns", e.target.value)}
                          placeholder="Story default"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-300">
                        <span>Max Plays per Turn</span>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                          value={member.maxPerTurn ?? ""}
                          onChange={(e) => handleMemberNumberChange(idx, "maxPerTurn", e.target.value)}
                          placeholder="Story default"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-300">
                        <span>Max Characters / Auto Reply</span>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                          value={member.maxCharsPerAuto ?? ""}
                          onChange={(e) => handleMemberNumberChange(idx, "maxCharsPerAuto", e.target.value)}
                          placeholder="Story default"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs text-slate-300">
                        <span>Send as Quiet</span>
                        <select
                          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                          value={sendAsQuietValue}
                          onChange={(e) => handleMemberFlagChange(idx, "sendAsQuiet", e.target.value)}
                        >
                          <option value="">Story default</option>
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-300">
                        <span>Force Speaker</span>
                        <select
                          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                          value={forceSpeakerValue}
                          onChange={(e) => handleMemberFlagChange(idx, "forceSpeaker", e.target.value)}
                        >
                          <option value="">Story default</option>
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      </label>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-medium text-slate-300">Trigger Probabilities</div>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                        {TALK_CONTROL_TRIGGER_OPTIONS.map(({ key, label }) => (
                          <label key={`${idx}-${key}`} className="flex flex-col gap-1 text-[11px] text-slate-300">
                            <span>{label}</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-slate-600"
                              value={member.probabilities?.[key] ?? ""}
                              onChange={(e) => handleProbabilityChange(idx, key, e.target.value)}
                              placeholder="Story default"
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] font-medium text-slate-300">Auto Replies</div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-600"
                            onClick={() => handleAddAutoReply(idx, "static")}
                          >
                            + Static Reply
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-600"
                            onClick={() => handleAddAutoReply(idx, "llm")}
                          >
                            + LLM Reply
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {member.autoReplies.map((reply, replyIdx) => (
                          <div key={`reply-${replyIdx}`} className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                                <select
                                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 focus:border-transparent focus:outline-none focus:ring-slate-600"
                                  value={reply.kind}
                                  onChange={(e) => handleAutoReplyKindChange(idx, replyIdx, e.target.value as "static" | "llm")}
                                >
                                  <option value="static">Static Text</option>
                                  <option value="llm">LLM Instruction</option>
                                </select>
                                <label className="flex items-center gap-1">
                                  <span>Weight</span>
                                  <input
                                    className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                                    value={reply.weight ?? 1}
                                    onChange={(e) => handleAutoReplyWeightChange(idx, replyIdx, e.target.value)}
                                  />
                                </label>
                              </div>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-red-300 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                                onClick={() => handleRemoveAutoReply(idx, replyIdx)}
                              >
                                Remove
                              </button>
                            </div>
                            {reply.kind === "static" ? (
                              <textarea
                                className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-slate-600"
                                rows={2}
                                value={reply.text ?? ""}
                                onChange={(e) => handleAutoReplyContentChange(idx, replyIdx, e.target.value)}
                                placeholder="Static response text (macros allowed)"
                              />
                            ) : (
                              <textarea
                                className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-slate-600"
                                rows={3}
                                value={reply.instruction ?? ""}
                                onChange={(e) => handleAutoReplyContentChange(idx, replyIdx, e.target.value)}
                                placeholder="Instruction prompt for the LLM"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded border border-dashed border-slate-700 bg-slate-900/30 px-3 py-4 text-center text-xs text-slate-400">
              No talk control members configured yet. Add a member to automate responses for this checkpoint.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TalkControlTab;

