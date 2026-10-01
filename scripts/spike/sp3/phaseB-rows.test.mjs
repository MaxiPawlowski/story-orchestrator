import { test } from "node:test";
import assert from "node:assert/strict";
import { attachAliases } from "./phaseB-rows.mjs";

const director = { use: "director", rows: [{ id: "AD001", answer: "SPEAKER: the Guildmaster", input: { candidates: [{ rosterId: "dm", name: "Adolion Narrator" }, { rosterId: "guildmaster", name: "Vallie" }] } }] };
const aliases = { roster: [{ id: "guildmaster", ship: ["Guildmaster"] }, { id: "dm" }] };

test("SP3.b Phase B rows: each candidate carries its member's ship aliases, nothing else changes", () => {
  const out = attachAliases(director, aliases);
  assert.deepEqual(out.rows[0].input.candidates, [{ rosterId: "dm", name: "Adolion Narrator" }, { rosterId: "guildmaster", name: "Vallie", aliases: ["Guildmaster"] }]);
  assert.equal(out.rows[0].answer, "SPEAKER: the Guildmaster");
  assert.equal(director.rows[0].input.candidates[1].aliases, undefined);
});
