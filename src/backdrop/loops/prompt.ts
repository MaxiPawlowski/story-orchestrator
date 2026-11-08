const MOTION: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:lake|sea|ocean|beach|river|stream|harbou?r|port|pond|coast|shore|bay|canal|water)\b/, "gentle ripples moving across the water surface, reflections shimmering"],
  [/\bwaterfall\b/, "the waterfall flowing steadily"],
  [/\b(?:forest|woods?|jungle|garden|park|trees?|grove|meadow|field|grass|orchard|blossom)\b/, "leaves and grass swaying softly in a light breeze"],
  [/\b(?:fireplace|hearth|campfire|bonfire|forge|candles?|torch(?:es)?|lanterns?)\b/, "the existing flames flickering softly"],
  [/\b(?:mountains?|peaks?|cliffs?|valley|hills?|landscape|sky|clouds?)\b/, "clouds drifting very slowly across the sky"],
];

export const backgroundWords = (name: string): string => name
  .replace(/\.[a-z0-9]{2,5}$/i, "")
  .replace(/\([^)]*\)/g, " ")
  .replace(/[_\-.]+/g, " ")
  .replace(/[^a-z0-9 ]/gi, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

export function loopPrompt(background: string): string {
  const words = backgroundWords(background);
  const motions = [...new Set(MOTION.filter(([pattern]) => pattern.test(words)).map(([, motion]) => motion))].slice(0, 3);
  return [
    words ? `${words} scene` : "a scene",
    ...(motions.length ? motions : ["almost still, light shifting very softly"]),
    "static locked-off tripod camera, every building, object and light stays exactly where it is, only the named elements move, slow calm ambient motion that returns to the first frame",
  ].join(", ");
}
