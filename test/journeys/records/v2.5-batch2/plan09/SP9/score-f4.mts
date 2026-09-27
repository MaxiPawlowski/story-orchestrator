import { readFileSync } from "node:fs";
import { scoreWitnessAgreement } from "../../../../../../src/runtime/spikes/witnessFilter.ts";

const [recordPath, labelsPath] = process.argv.slice(2);
const record = JSON.parse(readFileSync(recordPath, "utf8"));
const labels = JSON.parse(readFileSync(labelsPath, "utf8")).labels as Record<string, string[]>;
const presence: Record<number, string[] | null> = {};
for (const row of record.presence) presence[row.index] = row.presence;
const numeric: Record<number, string[]> = {};
for (const [key, value] of Object.entries(labels)) numeric[Number(key)] = value;
const result = scoreWitnessAgreement(presence, numeric);
const detail = result.disagreements.map((index) => ({ index, label: numeric[index], presence: presence[index] }));
console.log(JSON.stringify({ route: record.route, chatId: record.chatId, ...result, pass: result.rate >= 0.9, detail }, null, 1));
