import type { NormalizedTalkControl, NormalizedTalkControlCheckpoint, NormalizedTalkControlReply } from "@utils/story-validator";
import type { TalkControlTrigger } from "@utils/story-schema";
import { PLAYER_SPEAKER_ID } from "@constants/main";
import type { CharacterResolver } from "./CharacterResolver";

interface ReplyRuntimeState {
  lastActionTurn: number;
  actionTurnStamp: number;
  actionsThisTurn: number;
  totalTriggerCount: number;
}

interface TalkControlEvent {
  id: number;
  type: TalkControlTrigger;
  checkpointId: string | null;
  metadata?: Record<string, unknown>;
}

export interface PendingAction {
  event: TalkControlEvent;
  checkpointId: string;
  reply: NormalizedTalkControlReply;
  state: ReplyRuntimeState;
  replyIndex: number;
}

export class ReplySelector {
  private readonly runtimeStates = new Map<string, ReplyRuntimeState>();
  private currentTurn = 0;

  constructor(
    private config: NormalizedTalkControl | undefined,
    private characterResolver: CharacterResolver
  ) { }

  updateTurn(turn: number) {
    if (!Number.isFinite(turn)) return;
    this.currentTurn = Math.max(0, Math.floor(turn));
  }

  resetStates() {
    this.runtimeStates.clear();
  }

  private getCheckpointConfig(checkpointId: string): NormalizedTalkControlCheckpoint | undefined {
    if (!this.config) return undefined;
    return this.config.checkpoints.get(checkpointId);
  }

  private getReplyRuntimeState(checkpointId: string, replyIndex: number): ReplyRuntimeState {
    if (replyIndex < 0) {
      return { lastActionTurn: -Infinity, actionTurnStamp: -1, actionsThisTurn: 0, totalTriggerCount: 0 };
    }

    const key = `${checkpointId}::${replyIndex}`;
    let state = this.runtimeStates.get(key);

    if (!state) {
      state = { lastActionTurn: -Infinity, actionTurnStamp: -1, actionsThisTurn: 0, totalTriggerCount: 0 };
      this.runtimeStates.set(key, state);
    }

    if (state.actionTurnStamp !== this.currentTurn) {
      state.actionTurnStamp = this.currentTurn;
      state.actionsThisTurn = 0;
    }

    return state;
  }

  private shuffleReplies(replies: NormalizedTalkControlReply[]): NormalizedTalkControlReply[] {
    const clone = replies.slice();
    for (let i = clone.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
  }

  private passesProbabilityGate(reply: NormalizedTalkControlReply): boolean {
    return Math.random() * 100 < reply.probability;
  }

  private matchesSpeaker(reply: NormalizedTalkControlReply, speakerId: string): boolean {
    // Check if the reply expects the player
    if (reply.normalizedSpeakerId === PLAYER_SPEAKER_ID) {
      return speakerId === PLAYER_SPEAKER_ID;
    }

    // Check if the incoming speaker is the player but reply expects a character
    if (speakerId === PLAYER_SPEAKER_ID) {
      return false;
    }

    // Standard character matching
    const expectedIds = this.characterResolver.buildExpectedSpeakerIds(reply);
    return expectedIds.includes(speakerId);
  }

  selectAction(event: TalkControlEvent, activeCheckpointId: string | null): PendingAction | null {
    const checkpointId = event.checkpointId ?? activeCheckpointId;

    if (!checkpointId) return null;

    const checkpointConfig = this.getCheckpointConfig(checkpointId);
    if (!checkpointConfig) return null;

    const candidateReplies = checkpointConfig.repliesByTrigger.get(event.type) ?? [];
    if (!candidateReplies.length) {
      console.log("[Story TalkControl] No replies configured for trigger", {
        checkpointId,
        event,
      });
      return null;
    }

    const replies = this.shuffleReplies(candidateReplies);

    for (const reply of replies) {
      if (!reply.enabled) continue;

      // Check speaker match for afterSpeak events
      if (event.type === "afterSpeak") {
        const speakerId = typeof event.metadata?.speakerId === "string" ? event.metadata.speakerId : "";
        if (speakerId && !this.matchesSpeaker(reply, speakerId)) {
          console.log("[Story TalkControl] Skipped reply (speaker mismatch)", {
            memberId: reply.memberId,
            trigger: reply.trigger,
            checkpointId,
          });
          continue;
        }
      }

      // Check probability gate
      if (!this.passesProbabilityGate(reply)) {
        console.log("[Story TalkControl] Skipped reply due to probability gate", {
          reply,
          checkpointId,
        });
        continue;
      }

      // Check if already dispatched this turn
      const replyIndex = checkpointConfig.replies.findIndex((item) => item === reply);
      const state = this.getReplyRuntimeState(checkpointId, replyIndex);

      if (state.lastActionTurn === this.currentTurn) {
        console.log("[Story TalkControl] Skipped reply (already dispatched this turn)", {
          reply,
          checkpointId,
        });
        continue;
      }

      // Check if maxTriggers limit reached
      if (reply.maxTriggers !== undefined && state.totalTriggerCount >= reply.maxTriggers) {
        console.log("[Story TalkControl] Skipped reply (maxTriggers limit reached)", {
          reply,
          checkpointId,
          totalTriggerCount: state.totalTriggerCount,
          maxTriggers: reply.maxTriggers,
        });
        continue;
      }

      console.log("[Story TalkControl] Selected reply", {
        reply,
        checkpointId,
        replyIndex,
      });

      return { event, checkpointId, reply, state, replyIndex };
    }

    console.log("[Story TalkControl] No eligible replies matched", {
      checkpointId,
      trigger: event.type,
    });

    return null;
  }
}
