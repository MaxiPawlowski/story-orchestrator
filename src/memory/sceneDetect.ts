import type { SceneBreakReason } from "./types";

const TIME_SKIP_PATTERNS: RegExp[] = [
  /\b(later that (day|night|evening|morning)|the next (day|morning|evening|night)|hours later|days later|weeks later|months later|years? later|a (few )?(hours?|days?|weeks?|months?|years?) (later|passed|had passed)|the following (day|morning|week|month|year)|some time later|meanwhile|after (a while|some time))\b/i,
  /\b(a (year|month|week|decade)|several (years?|months?|weeks?|days?)|[a-z]+ (years?|months?|weeks?|days?) (passed|went by|had passed|had gone by))\b/i,
  /\b(as (dawn|morning|daylight|the sun) (broke|crept|arrived|filtered through|rose|spread)|when (dawn|morning) (came|broke|arrived))\b/i,
  /\b(as (night|darkness|dusk|evening) (fell|settled|crept|arrived|descended)|when (night|darkness|dusk) (came|fell|settled))\b/i,
  /\b(dozed? off|fell asleep|drifted off( to sleep)?|fell into (a |an? )?(deep )?(sleep|slumber))\b/i,
  /\b((woke|stirred|roused) (up\b|(as |to find\b|beside\b|from (a |his |her |their )?(sleep|slumber|nap|rest))|(as (dawn|morning|light)|with the (sun|light|dawn))))\b/i,
  /\b(regained consciousness|came to (his|her|their|my|your) senses?|opened (his|her|their|my|your) eyes (to find|and (found|saw)))\b/i,
  /\b(the morning after|by (morning|nightfall|dawn|dusk|daybreak|sundown|nighttime))\b/i,
  /\b(in the (days?|weeks?|months?|years?) (that|which) followed)\b/i,
];

const LOCATION_PATTERNS: RegExp[] = [
  /\b(arrived at (the|a|an|\w+'s)\s+\w+(\s+\w+)?|found (himself|herself|themselves|myself|yourself) (in|at) (a|an|the)\s+\w+(\s+\w+)?|made (his|her|their|my|your) way (to|into) (the|a|an|\w+'s)\s+\w+(\s+\w+)?|fled (to|into) (the|a|an)\s+\w+(\s+\w+)?|escaped (to|into) (the|a|an)\s+\w+(\s+\w+)?)\b/i,
  /\b((headed|led (him|her|them|us)|walked|wandered) (over )?(to|into|toward) (the|a|an|\w+'s)\s+\w+(\s+\w+)?)\b/i,
  /\b(settled (in|into|down in)|made (a|his|her|their|my) (home|camp|base) (in|at)|took (shelter|refuge) (in|at|among))\b/i,
  /\b(returned (to|back to) (the|a|an|\w+'s)\s+\w+(\s+\w+)?|made (his|her|their|my|your) way back (to|into) (the|a|an|\w+'s)\s+\w+(\s+\w+)?)\b/i,
  /\b(upon (arriving|reaching|entering) (at )?(the|a|an|\w+'s)\s+\w+(\s+\w+)?)\b/i,
];

const DIVIDER_PATTERNS: RegExp[] = [
  /^[-*~]{3,}$/m,
  /\*\s*\*\s*\*/,
];

export interface SceneHeuristicHit {
  hit: boolean;
  reason?: SceneBreakReason;
  signals: string[];
}

export function detectSceneBreakHeuristic(text: string, locationChanged: boolean, castChanged: boolean): SceneHeuristicHit {
  const signals: string[] = [];
  if (castChanged) signals.push("cast");
  if (locationChanged) signals.push("location-quality");
  const dividerHit = DIVIDER_PATTERNS.some((pattern) => pattern.test(text));
  if (dividerHit) signals.push("divider");
  const locationPhraseHit = LOCATION_PATTERNS.some((pattern) => pattern.test(text));
  if (locationPhraseHit) signals.push("location-phrase");
  const timeSkipHit = TIME_SKIP_PATTERNS.some((pattern) => pattern.test(text));
  if (timeSkipHit) signals.push("time_skip");

  if (!signals.length) return { hit: false, signals: [] };

  const reason: SceneBreakReason = castChanged
    ? "cast"
    : dividerHit
      ? "divider"
      : (locationChanged || locationPhraseHit)
        ? "location"
        : "time_skip";

  return { hit: true, reason, signals };
}
