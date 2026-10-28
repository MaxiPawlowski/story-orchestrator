import { blockIndex, checkPair, checkSequence, cutMarkerIndex, failingVerdict, firstDivergence, newestMessageIndex, perTurnBoundary } from "./prefixStability";

const turn = (role: string, text: string) => `<|turn>${role}\n${text}<turn|>\n`;

interface Layout {
  member: string;
  history: string[];
  d4?: string;
  d2?: string;
  d1?: string;
  head?: string[];
}

const HISTORY = Array.from({ length: 12 }, (_, index) => (index % 2 ? `Arin: reply ${index} about the old quarry road and the bell.` : `Player: line ${index}, I study the map by lamplight.`));

const gemma = ({ member, history, d4, d2, d1, head = ["Lore: the river town keeps its bells."] }: Layout) => {
  const turns = history.map((text, index) => turn(text.startsWith("Player") ? "user" : "model", text));
  const at = (depth: number) => turns.length - depth;
  const out: string[] = [turn("system", ["Write the next reply.", `Impersonate ${member}.`, `${member} is a careful scout.`, ...head].join("\n"))];
  turns.forEach((text, index) => {
    if (d4 && index === at(4)) out.push(turn("system", d4));
    if (d2 && index === at(2)) out.push(turn("system", d2));
    if (d1 && index === at(1)) out.push(turn("system", d1));
    out.push(text);
  });
  return `${out.join("")}<|turn>model\n`;
};

const turnN = (n: number, extra: Partial<Layout> = {}) => gemma({
  member: "Arin",
  history: HISTORY.slice(0, n),
  d4: `[Guidance at turn ${n}] Objective: reach the quarry before dusk.`,
  d2: `Recent events: turn ${n} happened by the river.`,
  d1: `Present: Arin, DM Narrator (turn ${n}).`,
  ...extra,
});

describe("prefixStability", () => {
  it("firstDivergence is null for identical text and the shorter length for a pure extension", () => {
    expect(firstDivergence("abc", "abc")).toBeNull();
    expect(firstDivergence("abc", "abcdef")).toBe(3);
    expect(firstDivergence("abXc", "abYc")).toBe(2);
  });

  it("the boundary is the second system turn, the first injected depth block", () => {
    const prompt = turnN(8);
    const boundary = perTurnBoundary(prompt);
    expect(boundary.source).toBe("cut-marker");
    expect(prompt.slice(boundary.at ?? 0)).toMatch(/^<\|turn>system\n\[Guidance at turn 8\]/);
    expect(cutMarkerIndex(prompt)).toBe(boundary.at);
  });

  it("a stable layout diverges exactly where the previous prompt's depth-4 block sat", () => {
    const previous = turnN(8);
    const next = turnN(10);
    const result = checkPair(previous, next);
    expect(result.verdict).toBe("ok");
    expect(result.divergence).toBeGreaterThanOrEqual(result.boundary ?? Infinity);
    expect((result.divergence ?? 0) - (result.boundary ?? 0)).toBeLessThan("<|turn>system".length);
    expect(result.lost).toBe(0);
    expect(result.nextBoundary).toBeGreaterThan(result.boundary ?? 0);
  });

  it("planted control: a clock macro churning in the head fails with the lost span", () => {
    const previous = turnN(8, { head: ["Lore: the river town keeps its bells.", "It is 3:04 PM."] });
    const next = turnN(10, { head: ["Lore: the river town keeps its bells.", "It is 3:05 PM."] });
    const result = checkPair(previous, next);
    expect(result.verdict).toBe("above-boundary");
    expect(result.lost).toBe((result.boundary ?? 0) - (result.divergence ?? 0));
    expect(previous.slice(result.divergence ?? 0)).toMatch(/^4 PM/);
    expect(failingVerdict(result.verdict)).toBe(true);
  });

  it("planted control: lore entries reordered in the head fail", () => {
    const previous = turnN(8, { head: ["Lore A: the bells.", "Lore B: the quarry."] });
    const next = turnN(10, { head: ["Lore B: the quarry.", "Lore A: the bells."] });
    expect(checkPair(previous, next).verdict).toBe("above-boundary");
  });

  it("planted control: an older history message rewritten fails", () => {
    const edited = [...HISTORY];
    edited[2] = "Player: line 2, I fold the map away.";
    const previous = turnN(8);
    const next = gemma({ member: "Arin", history: edited.slice(0, 10), d4: "[Guidance at turn 10] x", d2: "Recent events: y", d1: "Present: z" });
    expect(checkPair(previous, next).verdict).toBe("above-boundary");
  });

  it("a block that only changes its own content never fails", () => {
    const previous = turnN(8);
    const next = turnN(8, { d4: "[Guidance changed] Objective: hide from the patrol.", d2: "Recent events: other." });
    const result = checkPair(previous, next);
    expect(result.verdict).toBe("ok");
    expect(result.divergence).toBeGreaterThanOrEqual(result.boundary ?? Infinity);
  });

  it("identical prompts pass as identical", () => {
    expect(checkPair(turnN(8), turnN(8)).verdict).toBe("identical");
  });

  it("without any injected block the boundary is the newest message", () => {
    const previous = gemma({ member: "Arin", history: HISTORY.slice(0, 6) });
    const next = gemma({ member: "Arin", history: HISTORY.slice(0, 8) });
    const boundary = perTurnBoundary(previous);
    expect(boundary.source).toBe("newest-message");
    expect(previous.slice(boundary.at ?? 0)).toMatch(/^<\|turn>model\nArin: reply 5/);
    expect(newestMessageIndex(previous)).toBe(boundary.at);
    expect(checkPair(previous, next).verdict).toBe("ok");
  });

  it("block hints place the boundary when the format has no system marker", () => {
    const head = "Narrator card.\nLore: bells.\n";
    const block = "Objective: reach the quarry before dusk.";
    const previous = `${head}Player: one\nArin: two\n${block}\nPlayer: three\n`;
    const hints = [{ value: block, position: 1 }, { value: "Lore: bells.", position: 0 }];
    expect(blockIndex(previous, hints)).toBe(previous.indexOf(block));
    expect(perTurnBoundary(previous, hints)).toEqual({ at: previous.indexOf(block), source: "block" });
    const churned = `Narrator card (v2).\nLore: bells.\nPlayer: one\nArin: two\nPlayer: three\nArin: four\n${block}\nPlayer: five\n`;
    expect(checkPair(previous, churned, hints, hints).verdict).toBe("above-boundary");
  });

  it("block hints locate a block by a later line when the first line is short or macro-rendered", () => {
    const prompt = "head\n[Story]\nObjective: reach the quarry before dusk.\nrest";
    expect(blockIndex(prompt, [{ value: "[Story]\nObjective: reach the quarry before dusk.", position: 1 }])).toBe(prompt.indexOf("[Story]"));
    const rendered = "a long head line here\nArin walks\nObjective: reach the quarry before dusk.\nrest";
    expect(blockIndex(rendered, [{ value: "{{char}} walks\nObjective: reach the quarry before dusk.", position: 1 }])).toBe(rendered.indexOf("Objective") - "{{char}} walks\n".length);
  });

  it("a rendered chat-completion prompt cuts at the first system message after history", () => {
    const render = (n: number, block: string) => ["### system", "Main prompt.", "### system", "Card text.", ...HISTORY.slice(0, n - 1).map((text) => `### user\n${text}`), "### system", block, `### user\n${HISTORY[n - 1]}`].join("\n");
    const previous = render(6, "Objective one.");
    const boundary = perTurnBoundary(previous);
    expect(previous.slice(boundary.at ?? 0)).toMatch(/^### system\nObjective one\./);
    expect(checkPair(previous, render(8, "Objective two.")).verdict).toBe("ok");
  });

  it("a single-turn prompt has no newest-message boundary", () => {
    expect(newestMessageIndex(`${turn("user", "Read the story. values: a=1")}<|turn>model\n`)).toBeNull();
    expect(checkPair(`${turn("user", "values: a=1")}<|turn>model\n`, `${turn("user", "values: a=2")}<|turn>model\n`).verdict).toBe("no-boundary");
  });

  it("a prompt with no marker, block or turn is no-boundary, which fails closed", () => {
    const result = checkPair("plain text one", "plain text two");
    expect(result.verdict).toBe("no-boundary");
    expect(failingVerdict(result.verdict)).toBe(true);
  });

  it("checkSequence pairs consecutive prompts of the same key only", () => {
    const pairs = checkSequence([
      { key: "Arin", label: "a1", prompt: turnN(8) },
      { key: "DM", label: "d1", prompt: turnN(8, { member: "DM" }) },
      { key: "Arin", label: "a2", prompt: turnN(10) },
      { key: "DM", label: "d2", prompt: turnN(10, { member: "DM", head: ["It is 3:05 PM."] }) },
    ]);
    expect(pairs.map((pair) => [pair.key, pair.from, pair.to, pair.verdict])).toEqual([
      ["Arin", "a1", "a2", "ok"],
      ["DM", "d1", "d2", "above-boundary"],
    ]);
  });
});
