import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function attachAliases(director, aliases) {
  const ship = new Map(aliases.roster.map((member) => [member.id, member.ship ?? []]));
  return {
    ...director,
    use: "director",
    phase: "SP3.b Phase B: each candidate carries its member's ship[] aliases",
    rows: director.rows.map((row) => ({
      ...row,
      input: {
        ...row.input,
        candidates: row.input.candidates.map((candidate) => {
          const list = ship.get(candidate.rosterId) ?? [];
          return list.length ? { ...candidate, aliases: list } : candidate;
        }),
      },
    })),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [directorPath, aliasesPath, outPath] = process.argv.slice(2);
  if (!directorPath || !aliasesPath || !outPath) {
    console.error("usage: node scripts/spike/sp3/phaseB-rows.mjs <lab director.json> <lab aliases.json> <out.json>");
    process.exit(2);
  }
  const out = attachAliases(JSON.parse(readFileSync(directorPath, "utf8")), JSON.parse(readFileSync(aliasesPath, "utf8")));
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  const carried = out.rows.reduce((sum, row) => sum + row.input.candidates.filter((candidate) => candidate.aliases).length, 0);
  console.log(`${out.rows.length} rows, ${carried} candidate slots carry aliases -> ${outPath}`);
}
