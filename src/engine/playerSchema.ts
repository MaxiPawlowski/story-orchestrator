import type { CardBinding } from "./poseSchema";

export const PLAYER_NAME_MODES = ["any", "suggested", "fixed"] as const;
export type PlayerNameMode = (typeof PLAYER_NAME_MODES)[number];
export const PLAYER_ROLE_MAX_CHARS = 120;
export const PLAYER_SUMMARY_MAX_CHARS = 600;
export const PLAYER_ASSUMES_MAX = 8;
export const PLAYER_ASSUME_MAX_CHARS = 160;
export const PLAYER_DESCRIPTION_MAX_CHARS = 2000;
export const PLAYER_NAME_MAX_CHARS = 60;

export interface PlayerName {
  mode: PlayerNameMode;
  value?: string;
}

export interface StoryPlayer {
  role?: string;
  summary?: string;
  name?: PlayerName;
  assumes?: string[];
  suggested_description?: string;
  inject?: boolean;
  card?: CardBinding;
}
