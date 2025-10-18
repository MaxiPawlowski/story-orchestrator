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
export const ARBITER_PROMPT_MAX_LENGTH = 1200;
export const ARBITER_CHAT_NAME_CLAMP = 40;
export const ARBITER_CHAT_MESSAGE_CLAMP = 300;
export const ARBITER_LOG_SAMPLE_LENGTH = 200;

export const JSON_RUNTIME_MAX_FILES = 100;
export const JSON_RUNTIME_STOP_AFTER_MISSES = 5;

export const UI_SYNC_MAX_ATTEMPTS = 20;
export const UI_SYNC_RETRY_DELAY_MS = 100;
export const DEFAULT_ARBITER_PROMPT = "You are an impartial story overseer. The story is divided into distinct checkpoints. Decide which (if any) transition objective is satisfied.";
