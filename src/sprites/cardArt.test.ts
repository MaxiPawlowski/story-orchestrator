import { cardArt } from "./cardArt";
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
