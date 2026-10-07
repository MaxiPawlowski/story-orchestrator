export const ROW_TABLE_HEADS = ["Row", "Id", "Contract"];

export const VACUOUS_FLOORS = [
  /\bor refuses?\b/i,
  /\bor (?:are |is )?skipped\b/i,
  /\bor not run\b/i,
  /\bwhere possible\b/i,
  /\bbest[- ]effort\b/i,
  /(?:≥|>=|at least)\s*0(?![.,\d])/i,
  /(?:≤|<=|at most)\s*100\s*%/i,
];

const MEASURABLE = /\d|\bevery\b|\ball\b|\bno\b|\bnever\b|\bexactly\b|\bidentical\b|\bnone\b|\bgreen\b|\bunchanged\b|\bexplained\b|\btraced\b|\bonly\b|\buntil\b|\breplay\b|\bpasses\b|\bequivalent\b|\bfollows\b/i;

const isText = (value, min = 1) => typeof value === "string" && value.trim().length >= min;

export const floorProblems = (row, { binaryFloor, recordOnly }) => {
  const text = row.floor?.text;
  if (!isText(text)) return [`${row.id}: floor has no text`];
  if (!isText(row.floor.citation, 4)) return [`${row.id}: floor has no citation`];
  if (text === recordOnly || text === binaryFloor) return [];
  const vacuous = VACUOUS_FLOORS.filter((pattern) => pattern.test(text));
  if (vacuous.length) return [`${row.id}: floor cannot fail (${vacuous.map(String).join(", ")}): ${text}`];
  return MEASURABLE.test(text) ? [] : [`${row.id}: floor names nothing that can be measured: ${text}`];
};

export const rowProblems = (manifest) => {
  const problems = [];
  const stages = new Set(manifest.stages ?? []);
  const tiers = new Set(manifest.tiers ?? []);
  const builds = new Set(manifest.builds ?? []);
  const resets = new Set(Object.keys(manifest.resets ?? {}));
  const seen = new Set();
  const absent = new Set((manifest.absent ?? []).map((entry) => entry.id));
  for (const entry of manifest.absent ?? []) if (!isText(entry.why, 20)) problems.push(`${entry.id}: absent with no reason`);
  for (const row of manifest.rows ?? []) {
    const id = row.id;
    if (!isText(id)) { problems.push(`a row has no id: ${JSON.stringify(row).slice(0, 80)}`); continue; }
    if (seen.has(id)) problems.push(`${id}: duplicate id`);
    seen.add(id);
    if (absent.has(id)) problems.push(`${id}: listed as absent and as a row`);
    if (!stages.has(row.stage)) problems.push(`${id}: unknown stage ${JSON.stringify(row.stage)}`);
    if (!isText(row.source?.plan) || !isText(row.source?.section)) problems.push(`${id}: source needs plan and section`);
    if (!Array.isArray(row.prerequisites) || !row.prerequisites.length || !row.prerequisites.every((item) => isText(item))) problems.push(`${id}: no prerequisites`);
    if (!resets.has(row.reset)) problems.push(`${id}: unknown reset ${JSON.stringify(row.reset)}`);
    if (!Array.isArray(row.tier) || !row.tier.length || !row.tier.every((tier) => tiers.has(tier))) problems.push(`${id}: tier ${JSON.stringify(row.tier)} is not a non-empty list of ${[...tiers].join("/")}`);
    if (!builds.has(row.build)) problems.push(`${id}: build ${JSON.stringify(row.build)} is not prod or dev-diagnostic`);
    if (!isText(row.assertion, 10)) problems.push(`${id}: no assertion`);
    if (!Array.isArray(row.evidence) || row.evidence.length !== 2 || !row.evidence.every((slot) => slot === null || isText(slot))) problems.push(`${id}: evidence must be two slots (null or a record path)`);
    problems.push(...floorProblems(row, manifest));
  }
  for (const resetId of resets) if (!isText(manifest.resets[resetId], 30)) problems.push(`reset ${resetId} has no procedure`);
  return problems;
};

const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

export const planTableRows = (text) => {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].trim().startsWith("|") || !/^\s*\|[\s|:-]+\|\s*$/.test(lines[index + 1])) continue;
    const head = cells(lines[index])[0];
    let at = index + 2;
    for (; at < lines.length && lines[at].trim().startsWith("|"); at += 1) if (ROW_TABLE_HEADS.includes(head)) rows.push(cells(lines[at])[0]);
    index = at - 1;
  }
  return rows;
};

const RANGE = /\b(O|S-)(\d+)\s*(?:–|-|\.\.)\s*(?:O|S-)?(\d+)\b/g;
const TOKENS = [/\bO\d+b?\b/g, /\bS-\d+(?:-OOC)?\b/g, /\bS32-\d\b/g, /\bB1-(?:C\d+b?|R4)\b/g, /\bC4-(?:R6|J8)\b/g, /\bC14-b\b/g, /\bR4-live\b/g];

export const planRowTokens = (text) => {
  const found = new Set();
  for (const match of text.matchAll(RANGE)) {
    const [from, to] = [Number(match[2]), Number(match[3])];
    if (to <= from || to - from > 20) continue;
    for (let n = from; n <= to; n += 1) found.add(match[1] === "O" ? `O${n}` : `S-${String(n).padStart(2, "0")}`);
  }
  for (const pattern of TOKENS) for (const match of text.matchAll(pattern)) found.add(match[0]);
  return [...found].sort();
};

export const parityProblems = (manifest, planText) => {
  const rows = manifest.rows ?? [];
  const named = new Map();
  for (const row of rows) for (const name of [row.id, ...(row.labels ?? [])]) named.set(name, row.id);
  const absent = new Set((manifest.absent ?? []).flatMap((entry) => [entry.id, ...(entry.labels ?? [])]));
  const tableRows = planTableRows(planText);
  const listed = new Set(tableRows);
  const problems = [];
  for (const cell of tableRows) if (!named.has(cell) && !absent.has(cell)) problems.push(`plan 39 names row "${cell}" and the manifest has no row or label for it`);
  for (const token of planRowTokens(planText)) if (!named.has(token) && !absent.has(token)) problems.push(`plan 39 mentions ${token} and the manifest neither has it nor lists it as absent`);
  for (const row of rows) if (![row.id, ...(row.labels ?? [])].some((name) => listed.has(name))) problems.push(`manifest row ${row.id} is not named in any row table of plan 39`);
  const counted = new Map();
  for (const cell of tableRows) counted.set(cell, (counted.get(cell) ?? 0) + 1);
  for (const row of rows) if ((counted.get(row.id) ?? 0) > 1) problems.push(`plan 39 lists ${row.id} more than once`);
  return problems;
};
