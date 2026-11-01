import { readFileSync } from "fs";
import { join } from "path";
import { provenance } from "@memory/provenance";
import { heldSecrets, withheldEntryIds } from "@memory/heldSecrets";
import type { EpistemicEntry } from "@memory/types";
import {
  RELATION_FLOORS, buildRelationGraph, projectGraph, querySeeds, rankRows, relationVerdict, scoreRelationArm, type GraphSource, type RelationCase,
} from "./relationGraph";

interface Fixture {
  memory: Array<{ id: string; text: string; entities: string[] }>;
  ledger: Array<{ id: string; entity: string; entityType: string; field: string; value: string }>;
  cases: RelationCase[];
}

const fixture = JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures/spikes/relation-multihop.json"), "utf8")) as Fixture;
const live = provenance({ source: "extractor", messageId: 1, boundary: 1, pass: "shared-read" });
const source = (): GraphSource => ({
  memory: fixture.memory.map((row) => ({ ...row, provenance: live })),
  ledger: fixture.ledger.map((row) => ({ ...row, provenance: live })),
});

describe("spike relationGraph: read-only entity graph over the memory rows and ledger, one-hop recall expansion", () => {
  const graph = buildRelationGraph(source());

  it("projects nodes and co-occurrence edges, and the ledger links a subject to a value that names a node", () => {
    const projection = projectGraph(graph);
    expect(projection.nodes.find((node) => node.name === "Mara")).toMatchObject({ degree: 3, rows: 2 });
    expect(projection.edges).toEqual(expect.arrayContaining([{ from: "ida", to: "lower ward", weight: 1 }].map((edge) => ({ ...edge, from: "Ida", to: "lower ward" }))));
    expect(querySeeds(graph, "What did Tobin's sister hide?")).toEqual(["tobin"]);
  });

  it("drops rows that are not live, superseded or evicted, and old ledger versions", () => {
    const quarantined = { ...live, validity: "quarantined" as const };
    const built = buildRelationGraph({
      memory: [
        { id: "a", text: "Ana loves Bo.", entities: ["Ana", "Bo"], provenance: live },
        { id: "b", text: "Ana hates Bo.", entities: ["Ana", "Bo"], provenance: quarantined },
        { id: "c", text: "Ana met Cy.", entities: ["Ana", "Cy"], provenance: live, supersededBy: "a" },
        { id: "d", text: "Ana met Di.", entities: ["Ana", "Di"], provenance: live, evictedAt: { messageId: 2, boundary: 2 } },
      ],
      ledger: [
        { id: "l1", entity: "Ana", field: "location", value: "Bo", provenance: live },
        { id: "l2", entity: "Ana", field: "location", value: "harbour", provenance: live, supersedes: "l1" },
      ],
    });
    expect(built.rows.map((row) => row.id)).toEqual(["a", "l2"]);
    expect(built.adjacency.get("ana")?.get("bo")).toBe(1);
  });

  it("is deterministic: the same rows give the same order", () => {
    const again = buildRelationGraph(source());
    for (const entry of fixture.cases) expect(rankRows(again, entry.query, 1)).toEqual(rankRows(graph, entry.query, 1));
  });

  it("a graph built from a member's allowed view never reaches a withheld row, one hop or not", () => {
    const epistemic: EpistemicEntry[] = [{ id: "e1", subject: "Mara", tag: "hiding", content: "Mara buried a silver ring under the mill floor.", hiddenFrom: "Tobin", createdAt: 0, provenance: live }];
    const secrets = heldSecrets(epistemic, ["Mara", "Tobin"]);
    const rows = source().memory.map((row) => ({ ...row, tier: "facts", type: "event", importance: 2, expiration: "never", confidence: 1, activationTriggers: [], evidence: "", createdAt: 0, recallCount: 0 })) as never[];
    const withheld = withheldEntryIds(rows, secrets, ["tobin"]);
    expect([...withheld]).toEqual(["m2"]);
    const view = buildRelationGraph({ ...source(), memory: source().memory.filter((row) => !withheld.has(row.id)) });
    const reached = fixture.cases.flatMap((entry) => rankRows(view, entry.query, 1).map((row) => row.id));
    expect([...withheld].filter((id) => reached.includes(id))).toEqual([]);
  });

  it("floor RG1-RG3 (declared before measuring): recorded 2026-10-31, RG1/RG2 pass, RG3 distractor ceiling missed (0.5833 > 0.5), not retuned", () => {
    const zero = scoreRelationArm(graph, fixture.cases, 0);
    const one = scoreRelationArm(graph, fixture.cases, 1);
    const verdict = relationVerdict(zero, one);
    process.stdout.write(`relationGraph offline: zero-hop ${JSON.stringify(zero)} one-hop ${JSON.stringify(one)} floors ${JSON.stringify(RELATION_FLOORS)} verdict ${JSON.stringify(verdict)}\n`);
    expect(fixture.cases.length).toBeGreaterThanOrEqual(12);
    expect(one.directRecallAt4).toBeGreaterThanOrEqual(zero.directRecallAt4 - 0.1);
    expect(zero).toEqual({ cases: 12, twoHopRecallAt4: 0.3333, directRecallAt4: 0.9583, distractorsPerCase: 0.3333 });
    expect(one).toEqual({ cases: 12, twoHopRecallAt4: 0.8333, directRecallAt4: 0.9583, distractorsPerCase: 0.5833 });
    expect(verdict).toEqual({ twoHopRecall: true, twoHopGain: true, distractors: false, ok: false });
  });
});
