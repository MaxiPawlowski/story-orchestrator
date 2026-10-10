export type KnowledgeAudience = "player" | "author" | "setup";

export type KnowledgeFamily = "feature" | "guide" | "author" | "st";

export interface KnowledgeShowMe {
  kind: "feature" | "doc" | "studio";
  target: string;
}

export interface KnowledgeTopic {
  id: string;
  family: KnowledgeFamily;
  title: string;
  text: string;
  audience: KnowledgeAudience;
  source: string;
  since: string;
  showMe: KnowledgeShowMe | null;
}

export interface StSource {
  file: string;
  anchor: string;
}

export interface StTopic {
  id: string;
  title: string;
  audience: Exclude<KnowledgeAudience, "player">;
  text: string;
  sources: readonly StSource[];
}
