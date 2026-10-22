import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { featureAt } from "./where";

export const POLISH_FEATURES: readonly Feature[] = [
  {
    id: "reply-polish", name: "Reply polish", area: "characters", audience: "author",
    oneLine: "Checks what a reply would read like with a character's off-voice words removed, without changing the chat.",
    what: "When a reply uses a word its character would not use, a habit seen in two of their last six replies, or a phrase they keep repeating, one call to the "
      + "Reply polish model rewrites only those sentences in that character's voice. Quotes and every other sentence stay exactly as written, and code refuses any "
      + "result that changes a name, number, negation, player action or what happens. In this build it runs in shadow: the result is recorded for the author and "
      + "the chat is never changed. It never uses the play model, and stops at its hourly cap.",
    where: featureAt("polish", "enabled", "Reply polish"),
    settings: ["characters.polish", "characters.polishMode", "characters.polishMaxPerHour"], guideTopic: "story-polish", doc: authorGuideDoc("story-polish"),
    status: "experimental", needs: ["story", "group-chat", "harness-plugin"],
  },
];
