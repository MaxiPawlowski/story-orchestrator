import { castCardName, castMemberNames, type Story } from "@engine/index";

export const draftCastNames = (story: Pick<Story, "roster" | "requirements"> | null | undefined): string[] =>
  (story ? castMemberNames(story.roster ?? [], [...(story.roster ?? []).map(castCardName), ...(story.requirements?.members ?? [])]) : []);
