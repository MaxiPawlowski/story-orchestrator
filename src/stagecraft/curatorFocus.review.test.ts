import { parseCuratorResponse } from "./parse";
import { planCuratorProposal } from "./proposal";
import type { CuratorEntryView } from "./types";

const route = (n: number): CuratorEntryView => ({ lorebook: "SO-J11 Lore", comment: `Trade route ${n}`, keys: [`zqx-route-${n}`], content: `Route ${n} trades salt.`, disabled: n % 2 === 0 });

describe("T7 J11.26: the focused curator can only touch what it was shown", () => {
  const all = Array.from({ length: 40 }, (_, index) => route(index + 1));
  const shown = all.filter((entry) => [5, 6, 7, 8].includes(Number(entry.comment.split(" ").pop())));
  const reply = ["[enable] Trade route 2", "[disable] Trade route 1", "[enable] Trade route 6", "[why] tidy the routes"].join("\n");

  it("an op naming an entry left out of the prompt is dropped, never planned", () => {
    const proposal = parseCuratorResponse(reply, shown);
    expect(proposal.ops.map((op) => op.comment)).toEqual(["Trade route 6"]);
    expect(proposal.dropped).toHaveLength(2);
    const plan = planCuratorProposal(proposal, shown, { mode: "review", declined: [] });
    expect(plan.records.map((entry) => entry.op.comment)).toEqual(["Trade route 6"]);
  });

  it("control: the same reply over the unfocused scope keeps every op", () => {
    expect(parseCuratorResponse(reply, all).ops.map((op) => op.comment)).toEqual(["Trade route 2", "Trade route 1", "Trade route 6"]);
  });
});
