export const CARRY_COPY = {
  heading: "From an earlier story",
  pickHeading: "Continue from a finished run",
  pickIntro: "This story continues one you finished. Pick the run it follows on from; only what you saw at its end carries over.",
  replayIntro: "You finished this story before. Pick a run to carry its heritage into this one; the story itself starts over.",
  loading: "Looking for your finished runs…",
  none: "No finished run of that story was found in your chats.",
  fresh: "Start fresh",
  pick: "Continue from this run",
  ended: (title: string, ending: string) => (ending ? `${title} — ended with “${ending}”` : title),
  previously: "Previously…",
  dismiss: "Dismiss",
  refused: "This run could not be carried: it may have changed since the list was made. Pick another, or start fresh.",
};
