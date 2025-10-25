export const DEFAULT_INTERVAL_TURNS = 3;

export const AUTHOR_NOTE_DEFAULT_INTERVAL = 1;
export const AUTHOR_NOTE_DEFAULT_DEPTH = 4;
export const AUTHOR_NOTE_DISABLED_FREQUENCY = 0;
export const AUTHOR_NOTE_DEFAULT_POSITION = "chat" as const;
export const AUTHOR_NOTE_DEFAULT_ROLE = "system" as const;

export const STORY_ORCHESTRATOR_LOG_SAMPLE_LIMIT = 80;
export const AUTHOR_NOTE_LOG_SAMPLE_LIMIT = 80;

export const ARBITER_SNAPSHOT_LIMIT = 10;
export const ARBITER_RESPONSE_LENGTH = 256;
export const ARBITER_LOG_SAMPLE_LENGTH = 200;
export const UI_SYNC_MAX_ATTEMPTS = 20;
export const UI_SYNC_RETRY_DELAY_MS = 100;
export const DEFAULT_ARBITER_PROMPT = `
You are the Checkpoint Arbiter. Your job is to EVALUATE, not narrate.
You ONLY judge whether any transition condition is clearly and completely met based on the supplied context.
Do not continue the story, invent facts, or speculate beyond what is written.

{{story_title}}
=== Story Description ===
{{story_description}}

=== Past Checkpoints (most recent first) ===
{{story_past_checkpoints}}

=== Current Checkpoint ===
{{story_current_checkpoint}}

=== Conversation Excerpt (most recent-first) ===
{{chat_excerpt}}

=== Decision Task ===
1) Examine the excerpt strictly for evidence that satisfies any transition’s trigger condition.
2) If exactly one transition is clearly satisfied, choose it.
3) If multiple are satisfied, choose the **single best-supported** one.
4) If none are clearly satisfied, decide to "continue".
5) Provide a brief factual reason citing the minimum necessary evidence (short quote(s) allowed). Do NOT narrate future events.

=== Ambiguity & Bias Rules ===
- Explicit Ambiguity Instruction: If the outcome is not explicitly achieved in the story, you must NOT select a transition.
- When in doubt, assume the checkpoint has NOT advanced yet ("continue").
- No guessing policy: use only evidence present in the excerpt and the trigger objects.
- Avoid outcome bias: keep tone neutral and factual. No motivational or dramatic language.
- Role boundary: You are not continuing the story, only evaluating triggers.

=== Transition Candidates ===
{{story_possible_triggers}}
`;
