import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const RECORDS = "test/journeys/records/v2.4-acceptance";
const PLAN_SOURCES = ["J3", "J5", "J8", "J11", "J7", "cost/J7-judge-on"];

const STORY_FILES = {
  "sun-ruins": "examples/sun-ruins/quest-for-the-sun-ruins.json",
  "journey-j11-judge": "test/journeys/j11-judge.story.json",
  "so-j11-expand": "test/journeys/j11-expand.story.json",
  "so-j11-lore": "test/journeys/j11-lore.story.json",
  "so-j11-stall": "test/journeys/j11-stall.story.json",
  "so-j11-typed": "test/journeys/j11-typed.story.json",
  "so-j8-house-rules": "test/journeys/j8-house-rules.story.json",
  "so-j8-stagecraft": "test/journeys/j8-stagecraft.story.json",
  "legacy-v2-3a7f8d89": "test/journeys/j5-group.story.json",
  "adolion-adventurer": "test/fixtures/scan-gate/adolion-adventurer.story.json",
};

const HAND_REFERENTS = { "guild master": "guild_master" };

const tokenPattern = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;
const hidingPattern = /^\[hiding\]\s+(.+?)\s+from\s+(.+?)\s*\|\s*(.+)$/i;
const standardPattern = /^\[(\w+)\]\s+(.+?)\s*\|\s*(.+)$/i;
const ledgerPattern = /^\[state:([^\]]+):([^\]]+)\]\s*(.*)$/i;
const EPISTEMIC = new Set(["knows", "unaware", "suspects", "believes"]);

const norm = (value) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function rosterOf(storyId) {
  const file = STORY_FILES[storyId];
  if (!file || !existsSync(join(ROOT, file))) return null;
  const story = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
  return (story.roster ?? []).map((member) => ({ id: member.id, name: member.name ?? member.id, role: member.role }));
}

export function classify(name, roster) {
  const key = norm(name);
  if (!key || !roster?.length) return { kind: "none" };
  const exact = roster.find((member) => norm(member.name) === key);
  if (exact) return { kind: "canonical", id: exact.id };
  const parts = key.split(/\s*[,&/]\s*|\s+and\s+/).filter(Boolean);
  if (parts.length > 1) {
    const hits = parts.map((part) => classify(part, roster)).filter((hit) => hit.kind !== "none");
    if (hits.length) return { kind: "variant", id: hits.map((hit) => hit.id).join("+"), why: "multi-subject key" };
  }
  const hand = HAND_REFERENTS[key];
  if (hand && roster.some((member) => member.id === hand)) return { kind: "variant", id: hand, why: "title" };
  for (const member of roster) {
    const words = norm(member.name).split(" ");
    const idWords = member.id.replace(/_/g, " ");
    if (key === idWords || (member.role && key === norm(member.role))) return { kind: "variant", id: member.id, why: "role/id" };
    if (words.length > 1 && words.includes(key)) return { kind: "variant", id: member.id, why: "part of name" };
    const escaped = norm(member.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(key)) return { kind: "variant", id: member.id, why: "name with extra words" };
  }
  return { kind: "none" };
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (entry === "journal-follow.jsonl") yield path;
  }
}

export function namesInLine(rawLine) {
  const line = rawLine.trim();
  const hiding = line.match(hidingPattern);
  if (hiding) return [{ store: "epistemic", name: hiding[1].trim() }];
  const standard = line.match(standardPattern);
  if (standard && EPISTEMIC.has(standard[1].toLowerCase())) return [{ store: "epistemic", name: standard[2].trim() }];
  const ledger = line.match(ledgerPattern);
  if (ledger) return [{ store: "ledger", name: ledger[1].trim() }];
  if (/^MEMORY\s+/i.test(line)) {
    const rest = line.slice(line.indexOf(" ") + 1);
    let entity = "";
    for (const match of rest.matchAll(tokenPattern)) {
      if (match[1].toLowerCase() !== "entity") continue;
      const raw = match[2];
      entity = raw.startsWith("\"") && raw.endsWith("\"") ? raw.slice(1, -1) : raw;
    }
    return entity.split(",").map((part) => part.trim()).filter(Boolean).map((name) => ({ store: "memory", name }));
  }
  return [];
}

function groupCastOf(file) {
  const header = join(file, "..", "header-start.json");
  if (!existsSync(header)) return null;
  const members = JSON.parse(readFileSync(header, "utf8")).group?.members ?? [];
  return members.map((avatar) => avatar.replace(/\.png$/i, "")).map((name) => ({ id: name.toLowerCase().replace(/\s+/g, "_"), name }));
}

export function measure(files, { groupCast = false } = {}) {
  const rows = [];
  const decisions = [];
  const distinct = new Map();
  for (const file of files) {
    const seenAudits = new Set();
    const seenTalk = new Set();
    let storyId = null;
    for (const text of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!text.trim()) continue;
      let event;
      try { event = JSON.parse(text); } catch { continue; }
      if (event.kind === "session") storyId = event.detail?.storyId ?? null;
      if (event.kind === "talk") {
        const key = `${event.at}|${event.summary}`;
        if (seenTalk.has(key)) continue;
        seenTalk.add(key);
        const source = /\((\w+)\)\s*$/.exec(event.summary)?.[1] ?? "unknown";
        decisions.push({ file, source, miss: source === "fallback" });
      }
      if (event.kind !== "audit") continue;
      const detail = event.detail ?? {};
      const key = `${event.summary}|${JSON.stringify(detail.window)}|${detail.rawResponse}`;
      if (seenAudits.has(key)) continue;
      seenAudits.add(key);
      const storyRoster = rosterOf(storyId);
      const roster = groupCast && !storyRoster?.length ? groupCastOf(file) : storyRoster;
      for (const line of String(detail.rawResponse ?? "").split(/\r?\n/)) {
        for (const ref of namesInLine(line)) {
          const verdict = classify(ref.name, roster);
          const tag = `${ref.store}|${ref.name}|${storyId}`;
          const seen = distinct.get(tag) ?? { store: ref.store, name: ref.name, storyId, verdict, count: 0 };
          seen.count += 1;
          distinct.set(tag, seen);
          if (verdict.kind !== "none") rows.push({ file, store: ref.store, name: ref.name, storyId, ...verdict });
        }
      }
    }
  }
  const variants = rows.filter((row) => row.kind === "variant");
  const misses = decisions.filter((decision) => decision.miss);
  return {
    files: files.map((file) => relative(ROOT, file).replace(/\\/g, "/")),
    castRows: rows.length,
    variantRows: variants.length,
    a1Rate: rows.length ? variants.length / rows.length : null,
    byStore: Object.fromEntries(["epistemic", "ledger", "memory"].map((store) => [store, {
      cast: rows.filter((row) => row.store === store).length,
      variant: variants.filter((row) => row.store === store).length,
    }])),
    variants: [...new Set(variants.map((row) => `${row.store}:${row.name}->${row.id} (${row.why})`))],
    decisions: decisions.length,
    decisionSources: decisions.reduce((acc, decision) => ({ ...acc, [decision.source]: (acc[decision.source] ?? 0) + 1 }), {}),
    misses: misses.length,
    a2PerFifty: decisions.length ? (misses.length / decisions.length) * 50 : null,
    a3: { rowsOk: rows.length >= 300, decisionsOk: decisions.length >= 100 },
    distinct: [...distinct.values()].sort((a, b) => b.count - a.count).map((entry) => `${entry.count}\t${entry.store}\t${entry.name}\t${entry.storyId}\t${entry.verdict.kind}${entry.verdict.id ? `:${entry.verdict.id}` : ""}`),
  };
}

export function sourceFiles(all) {
  const base = join(ROOT, RECORDS);
  if (all) return [...walk(base)];
  return PLAN_SOURCES.flatMap((dir) => (existsSync(join(base, dir)) ? [...walk(join(base, dir))] : []))
    .filter((file, index, list) => list.indexOf(file) === index);
}

if (process.argv[1]?.endsWith("phaseA.mjs")) {
  const all = process.argv.includes("--all");
  const extra = process.argv.filter((arg) => arg.startsWith("--add=")).map((arg) => arg.slice(6));
  const files = [...sourceFiles(all), ...extra.flatMap((dir) => [...walk(join(ROOT, dir))])];
  const result = measure(files, { groupCast: process.argv.includes("--group-cast") });
  if (!process.argv.includes("--distinct")) delete result.distinct;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
