// v2.3 plan 03: the write-edge census guard.
//
// C1 was found by reading `JudgeRuntime.ask` and noticing it read its context after the await.
// There are seventy functions in `src/runtime` and `src/wizard` shaped that way, and reading is
// not a method — the next one gets found by a player whose chat picked up another chat's story.
//
// So the set is enumerated from the AST and recorded in `test/findings/ownership-sites.json`,
// and this guard fails whenever the file and the code disagree. It does NOT demand that all
// seventy check a token today: a guard that fails on fifty-four known sites is one somebody
// switches off. It demands that nobody ADD a site without classifying it, that no row rot, and
// that a row claiming a check actually has one.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { censusSites } from "../../test/findings/ownershipCensus";

/**
 * `partial` was added on 2026-09-20 because the vocabulary was forcing a false choice.
 * `commitBoundary` makes several writes and only one of them is guarded; `announceTransition` is
 * guarded entirely from its caller. Calling either "checked" would be the exact over-claim this
 * plan keeps finding in the findings ledger, and calling them "todo" would hide real work. A row
 * that says "partial" must say in its note what is covered and what is not.
 */
type Status = "checked" | "partial" | "delegate" | "local" | "todo";
const LEDGER_PATH = join(__dirname, "../../test/findings/ownership-sites.json");
const rows = JSON.parse(readFileSync(LEDGER_PATH, "utf-8")).rows as Record<string, { status: Status; note: string }>;

const sites = censusSites();
const byKey = new Map(sites.map((site) => [site.key, site]));
const DELEGATE_TARGET = /awaits ([\w.]+)/;

/** Rows addressable by bare `Class.method`, which is the form a delegate note names. */
const namesFrom = (table: Record<string, { status: Status }>) =>
  new Map(Object.keys(table).map((key) => [key.split("#")[1] ?? key, key]));

/**
 * Follow a delegate row's `awaits X` chain to the row that actually checks. Null when the chain
 * leaves the census, revisits a row, or dies on a row that is not `checked`.
 */
function delegateOwner(key: string, seen = new Set<string>(), table: Record<string, { status: Status; note: string }> = rows): string | null {
  if (seen.has(key)) return null;
  seen.add(key);
  const named = DELEGATE_TARGET.exec(table[key]?.note ?? "")?.[1];
  const target = named ? namesFrom(table).get(named) : undefined;
  if (!target) return null;
  const targetRow = table[target];
  if (!targetRow) return null;
  if (targetRow.status === "checked") return target;
  return targetRow.status === "delegate" ? delegateOwner(target, seen, table) : null;
}

describe("write-edge ownership census", () => {
  test("AS-9: no site is classified twice (JSON keeps the last duplicate key silently)", () => {
    const keys = [...readFileSync(LEDGER_PATH, "utf-8").matchAll(/^ {4}"([^"]+)": \{/gm)].map((match) => match[1]);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  test("every site that writes after an await is classified", () => {
    const unclassified = sites.filter((site) => !rows[site.key]);
    expect(unclassified.map((site) => `${site.key}  writes [${site.writes.join(", ")}]`)).toEqual([]);
  });

  test("no row describes a site that no longer exists", () => {
    // A stale row is worse than a missing one: it reads as coverage of code that has moved.
    expect(Object.keys(rows).filter((key) => !byKey.has(key))).toEqual([]);
  });

  test("a row claiming a token check has one", () => {
    const lying = Object.entries(rows)
      .filter(([key, row]) => row.status === "checked" && byKey.get(key)?.hasTokenCheck === false)
      .map(([key]) => key);
    expect(lying).toEqual([]);
  });

  test("a todo that has acquired a check is promoted, not left as owed work", () => {
    // The same bidirectional discipline as the findings ledger: the file tracks the code, and
    // silently-fixed work is as much a defect in the record as unfixed work claimed as done.
    const promotable = Object.entries(rows)
      .filter(([key, row]) => row.status !== "checked" && row.status !== "partial" && byKey.get(key)?.hasTokenCheck === true)
      .map(([key, row]) => `${key} is marked "${row.status}" but its body checks a token — set it to "checked"`);
    expect(promotable).toEqual([]);
  });

  test("a partial row says what is covered and what is not", () => {
    // The status is only honest if it carries the caveat. A bare "partial" is a shrug.
    const vague = Object.entries(rows)
      .filter(([, row]) => row.status === "partial")
      .filter(([, row]) => row.note.trim().length < 40)
      .map(([key]) => key);
    expect(vague).toEqual([]);
  });

  test("a delegate reaches a site that actually checks", () => {
    // The first version asked only that the named site be CENSUSED. Nine rows used that to claim a
    // check owned by a row reading "not yet checked" — the census reporting coverage it did not
    // have, which is the failure this whole plan is about, inside the ledger that exists to prevent
    // it (2026-09-21). The chain is followed rather than stopped at one hop, because a coordinator's
    // `save()` delegates on to the manager's `persist()`, and treating that honest row as a liar
    // would be the opposite error.
    const delegates = Object.entries(rows).filter(([, row]) => row.status === "delegate").map(([key]) => key);
    const names = namesFrom(rows);
    const broken = delegates
      .filter((key) => delegateOwner(key) === null)
      .map((key) => {
        const named = DELEGATE_TARGET.exec(rows[key].note)?.[1] ?? "(no `awaits` clause)";
        const target = names.get(named);
        return `${key} awaits ${named}, which ${target ? `is "${rows[target].status}", not "checked"` : "is not a censused site"}`;
      });
    expect(broken).toEqual([]);
    // A rule that resolves nothing passes over nothing.
    expect(delegates.filter((key) => delegateOwner(key) !== null).length).toBeGreaterThanOrEqual(10);
  });

  test("the delegate rule can fail: a chain ending anywhere but a check is refused", () => {
    // The test above is green because no row is currently broken, which says nothing about whether
    // the rule can go red — the exact shape of vacuous coverage this plan keeps finding. These are
    // the three ways a chain dies, each stated as its own case.
    const chain = (middle: Status): Record<string, { status: Status; note: string }> => ({
      "a.ts#A.x": { status: "delegate", note: "awaits B.y, which owns the check" },
      "b.ts#B.y": { status: middle, note: "awaits C.z" },
      "c.ts#C.z": { status: "checked", note: "checks a token" },
    });
    expect(delegateOwner("a.ts#A.x", new Set(), chain("delegate"))).toBe("c.ts#C.z");
    expect(delegateOwner("a.ts#A.x", new Set(), chain("todo"))).toBeNull();
    expect(delegateOwner("a.ts#A.x", new Set(), chain("partial"))).toBeNull();
    expect(delegateOwner("a.ts#A.x", new Set(), { "a.ts#A.x": { status: "delegate", note: "awaits Nothing.here" } })).toBeNull();
  });

  test("the census still finds the sites plan 03 was written against", () => {
    // A heuristic that silently stops matching turns this guard into a green light over nothing.
    expect(sites.length).toBeGreaterThanOrEqual(60);
    expect(byKey.get("src/runtime/judge.ts#JudgeRuntime.askOnce")?.hasTokenCheck).toBe(true);
  });
});

describe("V3: the census sees what it used to miss", () => {
  const fixture = [
    "class Host {",
    "  private readonly deps = {",
    "    clear: async () => { await work(); this.state = null; },",
    "  };",
    "  private handler = async () => { await work(); save(); };",
    "  async onlyAssigns() { await work(); this.flag = true; }",
    "  async commentOnly() { await work(); // run.stillOwns() would go here",
    "    save(); }",
    "  async realCheck() { await work(); if (!run.stillOwns()) return; save(); }",
    "  async callbacks() { await Promise.all(items.map(async (item) => { await work(); record(item); })); }",
    "}",
    "function commands() { register({ name: \"cp\", callback: async () => { await work(); apply(); } }); }",
  ].join("\n");
  const dir = mkdtempSync(join(tmpdir(), "census-"));
  writeFileSync(join(dir, "fixture.ts"), fixture);
  const found = new Map(censusSites([dir.split("\\").join("/")]).map((site) => [site.name, site]));

  test("arrow functions are censused and named by where they live", () => {
    expect([...found.keys()].sort()).toEqual(["Host.callbacks>map", "Host.commentOnly", "Host.deps.clear", "Host.handler", "Host.onlyAssigns", "Host.realCheck", "commands.callback[cp]"]);
  });

  test("a property assignment after an await is a write", () => {
    expect(found.get("Host.onlyAssigns")?.writes).toEqual(["=this.flag"]);
    expect(found.get("Host.deps.clear")?.writes).toEqual(["=this.state"]);
  });

  test("a check named only in a comment is not a check", () => {
    expect(found.get("Host.commentOnly")?.hasTokenCheck).toBe(false);
    expect(found.get("Host.realCheck")?.hasTokenCheck).toBe(true);
  });
});
