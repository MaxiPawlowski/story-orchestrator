import type { NormalizedStory, ValidationError } from "./schema";

type Parser = (json: unknown) => NormalizedStory | ValidationError[];

let parser: Parser | null = null;

export const STORY_PARSER_LOADING = "the story reader has not loaded yet; reload the page and try again";

export const installStoryParser = (next: Parser): void => {
  parser = next;
};

export const loadStoryParser = async (): Promise<Parser> => {
  if (!parser) installStoryParser((await import("./validate")).parseStory);
  return parser as Parser;
};

export const parseStory = (json: unknown): NormalizedStory | ValidationError[] => (parser ? parser(json) : [{ path: "$", message: STORY_PARSER_LOADING }]);
