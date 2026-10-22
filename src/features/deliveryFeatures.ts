import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { featureAt } from "./where";

export const DELIVERY_FEATURES: readonly Feature[] = [
  {
    id: "character-delivery", name: "Voice and delivery", area: "characters", audience: "author",
    oneLine: "Each character is told privately how they word things.",
    what: "A story can give each cast member a short voice sheet: notes on how they talk, words that are theirs, words they would not use, a rhythm and a line per mood. "
      + "Only that character is told it, before they speak. Phrases a character keeps repeating in their own recent replies, and the model habits the author lists, "
      + "are named back to that character alone as something to vary. It changes wording only, never what happens or what anyone knows. No model call.",
    where: featureAt("delivery", "enabled", "Voice and delivery"),
    settings: ["characters.delivery", "characters.deliveryRepetition"], guideTopic: "roster-polish", doc: authorGuideDoc("roster-polish"), status: "shipped",
    needs: ["story", "group-chat"],
    isOn: (settings) => settings.characters.delivery !== false,
  },
];
