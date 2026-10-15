import { cardArt, placeholderArt } from "./cardArt";
import { visualFixture } from "./visualFixtures";

test("wizard card art: accepted source, stale card, unprepared and not installed", () => {
  const source = visualFixture(), members = [{ name: "Arin", folder: "Synthetic", image: source.card.path }];
  expect(cardArt("arin ", members, { Synthetic: source }, () => true)).toEqual({ state: "accepted", folder: "Synthetic", base: source.base.path,
    bust: source.bust.path, revision: 1, pack: false });
  expect(cardArt("Arin", members, { Synthetic: source }, () => false)).toEqual({ state: "stale", folder: "Synthetic" });
  expect(cardArt("Arin", members, {}, () => true)).toEqual({ state: "unprepared", folder: "Synthetic" });
  expect(cardArt("Brin", members, { Synthetic: source }, () => true)).toEqual({ state: "not-installed" });
  expect(cardArt("  ", members, { Synthetic: source }, () => true)).toEqual({ state: "not-installed" });
});

test("SillyTavern's default card picture is recognised as no art, a drawn card is not", () => {
  const image = (fill: (k: number) => number) => ({ width: 64, height: 96, data: Uint8ClampedArray.from({ length: 64 * 96 * 4 }, (_, k) => (k % 4 === 3 ? 255 : fill(k))) });
  const placeholder = image((k) => (k >> 6) % 200), copy = image((k) => (k >> 6) % 200 + (k % 3 === 0 ? 1 : 0)), drawn = image((k) => (k * 7) % 255);
  expect(placeholderArt(copy, placeholder)).toBe(true);
  expect(placeholderArt(drawn, placeholder)).toBe(false);
  expect(placeholderArt({ ...copy, width: 32, height: 192 }, placeholder)).toBe(false);
});
