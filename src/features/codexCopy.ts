export const CODEX_TEXT = {
  journalTab: "Journal",
  people: "People",
  places: "Places",
  fresh: "new",
  tabsLabel: "Journal pages",
  countPeople: (count: number) => `${count} ${count === 1 ? "person" : "people"}`,
  countPlaces: (count: number) => `${count} ${count === 1 ? "place" : "places"}`,
} as const;
