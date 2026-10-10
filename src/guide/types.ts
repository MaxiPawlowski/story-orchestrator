export type GuideAudience = "player" | "setup" | "author";

export interface GuideHeading {
  level: number;
  text: string;
  slug: string;
}

export interface GuidePage {
  id: string;
  doc: string;
  audience: GuideAudience;
  title: string;
  headings: GuideHeading[];
  body: string;
}

export interface GuideNavSection {
  audience: GuideAudience;
  title: string;
  ids: string[];
}

export interface GuideTarget {
  id: string;
  anchor?: string;
}

export type GuideLink =
  | { kind: "page"; target: GuideTarget }
  | { kind: "external"; url: string }
  | { kind: "none" };
