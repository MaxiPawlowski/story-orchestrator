import { spriteFilesSaved, subscribeSpriteFiles, subscribeVisualSources, visualSourceAccepted } from "./visualChanges";

test("saved sprite files and an accepted visual source reach only their own listeners, until unsubscribed", () => {
  const files = jest.fn(), sources = jest.fn();
  const offFiles = subscribeSpriteFiles(files), offSources = subscribeVisualSources(sources);
  spriteFilesSaved();
  expect(files).toHaveBeenCalledTimes(1);
  expect(sources).not.toHaveBeenCalled();
  visualSourceAccepted();
  expect(sources).toHaveBeenCalledTimes(1);
  expect(files).toHaveBeenCalledTimes(1);
  offFiles(); offSources();
  spriteFilesSaved(); visualSourceAccepted();
  expect(files).toHaveBeenCalledTimes(1);
  expect(sources).toHaveBeenCalledTimes(1);
});
