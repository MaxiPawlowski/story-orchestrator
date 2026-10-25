import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [baselineDump, preventionDump, outDir, ...extraNames] = process.argv.slice(2);
if (!baselineDump || !preventionDump || !outDir) throw new Error("usage: node rate.mjs <baseline-dump.json> <prevention-dump.json> <outDir> [player name ...]");
const here = new URL("./", import.meta.url);
const set = JSON.parse(readFileSync(new URL("cards.json", here), "utf8"));
const members = set.members.map((m) => ({ name: m.card.name, sheet: m.sheet }));
const read = (path) => { const raw = JSON.parse(readFileSync(path, "utf8")); return raw.value ?? raw; };
const dumps = { baseline: read(baselineDump), prevention: read(preventionDump) };
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const strip = (text) => [...members.map((m) => m.name), "DM Narrator", ...extraNames].reduce((acc, name) => acc.replace(new RegExp(`\\b${escape(name)}\\b`, "g"), "[name]"), text);
const items = [];
for (const arm of ["baseline", "prevention"]) for (let n = 1; n <= set.situations.length; n += 1) for (const m of members) {
  const row = dumps[arm][`so-v29-s6h-${arm}-${String(n).padStart(2, "0")}-${m.name}`];
  if (row) items.push({ arm, situation: n, member: m.name, mes: row.mes });
}
const complete = (n) => ["baseline", "prevention"].every((arm) => members.every((m) => items.some((i) => i.arm === arm && i.situation === n && i.member === m.name)));
const scored = items.filter((i) => complete(i.situation));
let seed = 20261025;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const shuffle = (list) => { for (let i = list.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
const header = [
  `You attribute role-play replies to their speaker. The names in each reply were replaced with [name]. The speaker is one of these three characters:`,
  ...members.map((m) => `- ${m.name}: ${m.sheet.notes}`),
  `For each reply answer with exactly one of: ${members.map((m) => m.name).join(", ")}, unclear. Pick unclear if the voice does not tell you.`,
  `Answer exactly one line per item: <id> <${members.map((m) => m.name).join("|")}|unclear>. No other text.`,
  "",
];
const config = JSON.stringify({ $schema: "https://opencode.ai/config.json", agent: { "so-judge": { mode: "primary", prompt: "You are a careful, impartial reader of roleplay fiction.", tools: { "*": false }, permission: { edit: "deny", bash: "deny", webfetch: "deny" } } } });
const sol = (dir, prompt) => new Promise((done, fail) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "prompt.txt"), prompt);
  const child = spawn("C:/Users/RolaPorElNapo/bin/opencode/opencode.exe", ["run", "--standalone", "--format", "json", "--agent", "so-judge", "-m", "openai/gpt-6.1-sol", "--file", join(dir, "prompt.txt"), "Rate every item in the attached file exactly as its instructions say. Output only the answer lines."], { cwd: dir, env: { ...process.env, OPENCODE_CONFIG_CONTENT: config }, windowsHide: true });
  let out = "", err = "";
  child.stdout.on("data", (c) => { out += c; }); child.stderr.on("data", (c) => { err += c; }); child.stdin.on("error", () => {});
  const timer = setTimeout(() => child.kill(), 900000);
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) return fail(new Error(`opencode exited ${code}: ${err.slice(0, 500)}`));
    const text = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("{")).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e) => e?.type === "text").map((e) => e.part?.text ?? "").join("");
    writeFileSync(join(dir, "answer.txt"), text);
    done(new Map([...text.matchAll(/^(R\d+)\s+(\S+)/gm)].map((m) => [m[1], m[2]])));
  });
  child.stdin.end();
});
const blind = shuffle(scored.map((item) => ({ ...item })));
blind.forEach((item, index) => { item.key = `R${index + 1}`; });
const verdicts = await sol(join(outDir, "attribution"), [...header, ...blind.flatMap((item) => [`### ${item.key}`, strip(item.mes), ""])].join("\n"));
const repeat = shuffle(blind.filter((item) => item.arm === "prevention").map((item) => ({ ...item }))).slice(0, 10);
repeat.forEach((item, index) => { item.repeatKey = `R${index + 1}`; });
const again = await sol(join(outDir, "repeat"), [...header, ...repeat.flatMap((item) => [`### ${item.repeatKey}`, strip(item.mes), ""])].join("\n"));
const term = (text, phrase) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(phrase.toLowerCase())}($|[^\\p{L}\\p{N}])`, "u").test(text.toLowerCase());
const hits = (item) => { const sheet = members.find((m) => m.name === item.member).sheet; return [...(sheet.tics ?? []), ...(sheet.avoid ?? [])].filter((p) => term(item.mes, p)).length; };
const rows = blind.map((item) => ({ key: item.key, arm: item.arm, situation: item.situation, member: item.member, picked: verdicts.get(item.key) ?? null, correct: verdicts.get(item.key) === item.member, hits: hits(item) }));
const arm = (name) => {
  const list = rows.filter((r) => r.arm === name);
  return { replies: list.length, correct: list.filter((r) => r.correct).length, unclear: list.filter((r) => r.picked === "unclear").length, unrated: list.filter((r) => r.picked === null).length,
    perMember: Object.fromEntries(members.map((m) => [m.name, { correct: list.filter((r) => r.member === m.name && r.correct).length, of: list.filter((r) => r.member === m.name).length }])),
    hits: list.reduce((acc, r) => acc + r.hits, 0) };
};
const base = arm("baseline"), prev = arm("prevention");
const pct = (a) => (a.replies ? (a.correct / a.replies) * 100 : 0);
const perReply = (a) => (a.replies ? a.hits / a.replies : 0);
const report = {
  corpus: "v29-02-s6h", situationsComplete: [...new Set(scored.map((i) => i.situation))].length, situationsPlanned: set.situations.length,
  baseline: base, prevention: prev,
  attributionGainPoints: Math.round((pct(prev) - pct(base)) * 10) / 10, attributionFloor: 10,
  repetitionDownPct: perReply(base) ? Math.round((1 - perReply(prev) / perReply(base)) * 1000) / 10 : null, repetitionFloor: 25,
  selfAgreement: { same: repeat.filter((item) => again.get(item.repeatKey) === verdicts.get(item.key)).length, of: repeat.length },
  rater: "opencode openai/gpt-6.1-sol", rows,
};
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, rows: undefined }, null, 1));
