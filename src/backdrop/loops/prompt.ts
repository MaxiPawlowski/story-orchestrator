const MOTION: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:lake|sea|ocean|beach|river|stream|harbou?r|port|pond|waterfall|coast|shore|bay|canal|water)\b/, "gentle ripples moving across the water"],
  [/\b(?:beach|coast|shore|ocean|sea)\b/, "small waves rolling in slowly"],
  [/\b(?:forest|woods?|jungle|garden|park|tree|trees|grove|meadow|field|grass|treehouse|blossom|orchard)\b/, "leaves and grass swaying softly in a light breeze"],
  [/\b(?:tavern|inn|hearth|fireplace|camp|campfire|forge|candle|torch|dungeon|cave|castle|hall|throne|royal|temple|crypt)\b/, "warm firelight and candle flames flickering softly"],
  [/\b(?:city|town|market|street|village|cityscape|alley|square|harbou?r)\b/, "faint smoke drifting from chimneys, banners stirring in the wind"],
  [/\b(?:mountain|mountains|peak|cliff|valley|hill|hills|landscape|sky|ruins?)\b/, "clouds drifting slowly across the sky"],
  [/\b(?:snow|winter|frozen|ice)\b/, "light snow drifting down"],
  [/\b(?:night|moon|stars?|evening)\b/, "stars twinkling faintly, soft moonlight shimmering"],
  [/\b(?:classroom|bedroom|room|office|library|university|house|kitchen|bar|shop)\b/, "dust motes floating in the light, curtains stirring gently"],
  [/\b(?:postapoc|wasteland|desert|ruin|ruins)\b/, "dust blowing slowly across the ground"],
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
    ...(motions.length ? motions : ["subtle ambient motion, light shifting softly"]),
    "static locked-off camera, no camera movement, no people moving, calm seamless ambient loop, same composition throughout",
  ].join(", ");
}
