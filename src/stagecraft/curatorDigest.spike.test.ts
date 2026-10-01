import { readFileSync } from "fs";
import { join } from "path";
import { buildDigestCuratorPrompt, digestEntries, DIGEST_FULL_LIMIT, DIGEST_MIN_ENTRIES, refuseTitleOnly } from "./curatorDigest";
import { parseCuratorResponse } from "./parse";
import { buildWiCuratorPrompt } from "./prompt";
import { planCuratorProposal } from "./proposal";
import type { CuratorEntryView, CuratorScope } from "./types";

const W4_MAX_RATIO = 0.4;

const read = <T>(path: string): T => JSON.parse(readFileSync(join(__dirname, "../..", path), "utf8")) as T;
const profile = read<{ source: { entries: number }; entries: Array<{ initial: string; title: number; content: number; keys: number[]; disabled: boolean }> }>("test/fixtures/spikes/v25-09/adolion-world-profile.json");
const calibration = read<{ cases: Array<{ id: string; scope: CuratorScope; required: Array<{ comment: string; kinds: string[] }> }> }>("test/fixtures/role-calibration/curator.json");

const fill = (seed: string, length: number) => (seed + " lorem ipsum dolor sit amet".repeat(Math.ceil(length / 26) + 1)).slice(0, length);

const padding: CuratorEntryView[] = profile.entries.map((row, index) => ({
  lorebook: "Adolion World",
  comment: fill(`${row.initial}${String(index).padStart(3, "0")}`, Math.max(4, row.title)).trim(),
  keys: row.keys.map((length, key) => fill(`q${index}x${key}`, Math.max(3, length)).trim()),
  content: fill("", row.content),
  disabled: row.disabled,
  uid: 1000 + index,
}));

const cases = calibration.cases;

const padded = (scope: CuratorScope): CuratorScope => ({ ...scope, entries: [...scope.entries, ...padding] });

describe("v2.5 plan 09 SP8 W4 (a): the digest bounds the prompt on an Adolion-sized book", () => {
  const ratios = cases.map((entry) => {
    const scope = padded(entry.scope);
    const digest = digestEntries(scope.entries, scope);
    const needsText = entry.required.filter((item) => item.kinds.every((kind) => kind === "rewrite" || kind === "patch"));
    const hiddenRequired = needsText.filter((item) => digest?.titleOnly.some((view) => view.comment.toLowerCase() === item.comment.toLowerCase())).map((item) => item.comment);
    return { id: entry.id, entries: scope.entries.length, full: buildWiCuratorPrompt(scope).length, digest: digest ? buildDigestCuratorPrompt(scope, digest).length : null, hiddenRequired };
  });
  const worst = Math.max(...ratios.map((row) => (row.digest ?? row.full) / row.full));

  it("runs over the 12 calibration cases on a >= 150-entry book built from the real size profile", () => {
    expect(profile.source.entries).toBeGreaterThanOrEqual(150);
    expect(ratios).toHaveLength(12);
    expect(ratios.every((row) => row.entries >= 150 && row.digest !== null)).toBe(true);
    if (process.env.SO_SPIKE_REPORT) process.stdout.write(`${JSON.stringify({ worst, ratios })}\n`);
  });

  it("W4 (a): the digest prompt is at most 40 % of today's prompt in every case", () => {
    expect(worst).toBeLessThanOrEqual(W4_MAX_RATIO);
  });
});

describe("v2.5 plan 09 SP8 digest behaviour", () => {
  const scope = padded(cases[0].scope);
  const digest = digestEntries(scope.entries, scope)!;

  it("leaves a small book's prompt byte-identical (no digest below the threshold)", () => {
    expect(digestEntries(cases[0].scope.entries, cases[0].scope)).toBeNull();
    expect(digestEntries(padding.slice(0, DIGEST_MIN_ENTRIES - 1), cases[0].scope)).toBeNull();
  });

  it("shows in full only entries whose title or key the story names, at most sixteen", () => {
    expect(digest.full.map((entry) => entry.comment)).toEqual(["The Old Tunnel", "Bel"]);
    const crowded = { ...scope, canon: padding.slice(0, 30).map((entry) => entry.keys[0] ?? entry.comment).join(". ") };
    expect(digestEntries(crowded.entries, crowded)!.full).toHaveLength(DIGEST_FULL_LIMIT);
  });

  it("lists every other entry by title so the curator can still switch it, and resolves it by its #ref", () => {
    const prompt = buildDigestCuratorPrompt(scope, digest);
    expect(digest.titleOnly.every((entry) => prompt.includes(`"${entry.comment}"`))).toBe(true);
    expect(prompt).toContain("OTHER ENTRIES (title only");
    expect(prompt).toContain("you may only [disable] the ones [currently on]");
    const off = digest.titleOnly.find((entry) => entry.disabled);
    const on = digest.titleOnly.find((entry) => !entry.disabled);
    if (off) expect(prompt).toContain(`"${off.comment}" [currently off]`);
    if (on) expect(prompt).toContain(`"${on.comment}" [currently on]`);
    expect(prompt.split("  content: ").length - 1).toBe(digest.full.length);
    const target = digest.titleOnly.find((entry) => entry.disabled) ?? digest.titleOnly[3];
    const proposal = parseCuratorResponse(`[${target.disabled ? "enable" : "disable"}] #${target.uid}`, scope.entries);
    expect(proposal.ops.map((op) => op.comment)).toEqual([target.comment]);
  });

  it("refuses a rewrite or patch of a title-only entry at plan time, and keeps a switch", () => {
    const hidden = digest.titleOnly.find((entry) => !entry.disabled && entry.content.length < 300)!;
    const proposal = parseCuratorResponse(`[rewrite] #${hidden.uid} || New text.\n[disable] #${hidden.uid}`, scope.entries);
    const plan = refuseTitleOnly(planCuratorProposal(proposal, scope.entries), digest);
    expect(plan.records.map((record) => record.op.kind)).toEqual(["disable"]);
    expect(plan.dropped.some((reason) => reason.includes("only the title of this entry was shown"))).toBe(true);
  });
});
