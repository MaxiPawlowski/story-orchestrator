import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryTab } from "../components/drawer/tabs/MemoryTab";
import { heldSecrets, shownRows, withWithheld, withoutSecretLines, type EpistemicEntry, type MemoryEntry } from "@memory/index";
import type { RuntimeManager } from "./index";
import type { RuntimeSnapshot } from "./types";

const NAMES = ["Narrator", "Aria", "Bram"];
const SECRET = /silver key|vault/i;
const HIDING = { id: "h-kel", subject: "Kel", tag: "hiding", hiddenFrom: "Bram", content: "that he carries a silver key to the old vault", messageId: 1, createdAt: 1 } as unknown as EpistemicEntry;
const ARIA_KNOWS = { id: "k-aria", subject: "Aria", tag: "knows", content: "Kel carries a silver key to the old vault", messageId: 1, createdAt: 1 } as unknown as EpistemicEntry;
const secrets = heldSecrets([HIDING, ARIA_KNOWS], NAMES);
const resting = (text: string) => withoutSecretLines(text, secrets, null);
const identity = (text: string) => text;

const entry = (id: string, text: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id, tier: "facts", text, messageId: 7, createdAt: 7, type: "relationship", importance: 2, expiration: "permanent",
  entities: ["Kel"], confidence: 1, activationTriggers: [], evidence: text, recallCount: 0, ...extra,
}) as unknown as MemoryEntry;

const MIXED = "Kel trusts Aria with his life. Kel carries a silver key to the old vault.";
const ENTRIES = [
  entry("whole", "Kel carries a silver key to the old vault."),
  entry("paraphrase", "Kel keeps a silver key for the old vault on his belt."),
  entry("mixed", MIXED, { pinned: true }),
  entry("plain", "Kel and Bram fought side by side at the ford."),
];

const snapshot = (entries: MemoryEntry[], filter: (text: string) => string, authorView = false): RuntimeSnapshot => ({
  ui: { authorView },
  memory: { entries, backfill: { running: false, processed: 0, total: 0 }, pinnedOverflow: 0, arcs: [], derived: [], conflicts: [] },
  memoryShown: shownRows(entries, filter),
  castNames: {},
}) as unknown as RuntimeSnapshot;

const manager = {} as unknown as RuntimeManager;
const render = (shot: RuntimeSnapshot) => renderToStaticMarkup(createElement(MemoryTab, { snapshot: shot, manager, authorView: shot.ui.authorView }));

describe("owner decision 2026-10-07: the player's Memory tab reads through the resting view", () => {
  it("drops a row that only states the held secret and its paraphrase, and trims a mixed row", () => {
    const html = render(snapshot(ENTRIES, resting));
    expect(html).not.toMatch(SECRET);
    expect(html).toContain("Kel trusts Aria with his life.");
    expect(html).toContain("Kel and Bram fought side by side at the ford.");
  });

  it("K1: the player copy is the same as a chat that never held the secret, with no count or marker", () => {
    const held = render(snapshot(ENTRIES, resting));
    const never = render(snapshot([entry("mixed", "Kel trusts Aria with his life.", { pinned: true }), ENTRIES[3]], identity));
    expect(held).toBe(never);
  });

  it("keeps the original row id on the trimmed row, so pin, edit and exclude act on it", () => {
    const html = render(snapshot(ENTRIES, resting));
    expect(html).toContain('data-id="mixed"');
    expect(html).not.toContain('data-id="whole"');
    expect(html).not.toContain('data-id="paraphrase"');
  });

  it("an edit of a trimmed row keeps the withheld sentence; an edit of an untrimmed row is the edit", () => {
    expect(withWithheld(MIXED, "Kel trusts Aria with his life.", "Kel trusts Aria.")).toBe("Kel trusts Aria. Kel carries a silver key to the old vault.");
    expect(withWithheld("The ford held.", "The ford held.", "The ford held at dawn.")).toBe("The ford held at dawn.");
  });

  it("Author view keeps the full list", () => {
    const html = render(snapshot(ENTRIES, resting, true));
    for (const row of ENTRIES) expect(html).toContain(`data-id="${row.id}"`);
    expect(html).toMatch(SECRET);
  });

  it("control: with no held secret the player sees every row as stored", () => {
    const html = render(snapshot(ENTRIES, identity));
    for (const row of ENTRIES) expect(html).toContain(`data-id="${row.id}"`);
    expect(html).toMatch(SECRET);
  });

  it("control: the filter itself redacts, so the tests above are not vacuous", () => {
    expect(resting(ENTRIES[0].text)).toBe("");
    expect(resting(ENTRIES[1].text)).toBe("");
    expect(resting(MIXED)).toBe("Kel trusts Aria with his life.");
    expect(resting(ENTRIES[3].text)).toBe(ENTRIES[3].text);
  });
});
