export interface VisualPackRef {
  id: string;
  digest: string;
}

export interface StoryVisualPacks {
  style?: VisualPackRef;
  identities?: Record<string, VisualPackRef>;
  places?: Record<string, VisualPackRef>;
}
