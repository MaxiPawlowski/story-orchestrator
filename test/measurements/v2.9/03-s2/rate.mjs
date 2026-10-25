import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const outDir = args[args.indexOf("--out") + 1];
const dumps = args.filter((arg, index) => arg !== "--out" && args[index - 1] !== "--out");
if (!outDir || !dumps.length) throw new Error("usage: node rate.mjs --out <dir> <harvest-dump.json> [...]");
const root = new URL("../../../../", import.meta.url);
const scenario = JSON.parse(readFileSync(new URL("test/scenarios/v29-03-s2-shadow.json", root), "utf8"));
const roster = scenario.steps.find((s) => s.import_story).import_story.roster.filter((m) => m.polish);
const names = roster.map((m) => m.name);
const PLANNED = 100;
const EVALUATED = new Set(["accepted", "refused", "unchanged"]);
const runs = dumps.flatMap((path) => {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const value = raw.value ?? raw;
  return Object.entries(value).filter(([k]) => k.startsWith("so-v29-s2-run-")).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ run: k, ...v }));
});
const applyWindows = (mes, windows) => {
  let text = mes;
  for (const w of windows ?? []) {
    if (typeof w.after !== "string") return null;
    const at = text.indexOf(w.before);
    if (at < 0 || text.indexOf(w.before, at + 1) >= 0) return null;
    text = text.slice(0, at) + w.after + text.slice(at + w.before.length);
  }
  return text;
};
const eligible = [];
const skipped = [];
for (const run of runs) for (const record of run.ring) {
  if (!EVALUATED.has(record.verdict) || !names.includes(record.speaker)) continue;
  const row = run.messages.find((m) => m.id === record.messageId);
  if (!row || row.name !== record.speaker || (row.sendDate && record.sendDate && row.sendDate !== record.sendDate)) {
    skipped.push({ run: run.run, messageId: record.messageId, why: "row moved" });
    continue;
  }
  const polished = record.verdict === "accepted" ? applyWindows(row.mes, record.windows) : row.mes;
  if (polished === null) {
    skipped.push({ run: run.run, messageId: record.messageId, why: "windows do not apply" });
    continue;
  }
  eligible.push({ run: run.run, messageId: record.messageId, speaker: record.speaker, verdict: record.verdict, original: row.mes, polished });
}
const used = eligible.slice(0, PLANNED);
const accepted = used.filter((item) => item.verdict === "accepted");
let seed = 20261025;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const shuffle = (list) => { for (let i = list.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const strip = (text) => [...names, "DM Narrator"].reduce((acc, name) => acc.replace(new RegExp(`\\b${escape(name)}\\b`, "g"), "[name]"), text);
const notes = roster.map((m) => `- ${m.name}: ${m.polish.notes}`);
const config = JSON.stringify({ $schema: "https://opencode.ai/config.json", agent: { "so-judge": { mode: "primary", prompt: "You are a careful, impartial reader of roleplay fiction.", tools: { "*": false }, permission: { edit: "deny", bash: "deny", webfetch: "deny" } } } });
const sol = (dir, prompt, pattern) => new Promise((done, fail) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "prompt.txt"), prompt);
  const child = spawn("C:/Users/RolaPorElNapo/bin/opencode/opencode.exe", ["run", "--standalone", "--format", "json", "--agent", "so-judge", "-m", "openai/gpt-6.1-sol", "--file", join(dir, "prompt.txt"), "Rate every item in the attached file exactly as its instructions say. Output only the answer lines."], { cwd: dir, env: { ...process.env, OPENCODE_CONFIG_CONTENT: config }, windowsHide: true });
  let out = "";
  let err = "";
  child.stdout.on("data", (c) => { out += c; });
  child.stderr.on("data", (c) => { err += c; });
  child.stdin.on("error", () => {});
  const timer = setTimeout(() => child.kill(), 900000);
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) return fail(new Error(`opencode exited ${code}: ${err.slice(0, 500)}`));
    const text = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("{")).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e) => e?.type === "text").map((e) => e.part?.text ?? "").join("");
    writeFileSync(join(dir, "answer.txt"), text);
    done(new Map([...text.matchAll(pattern)].map((m) => [m[1], m.slice(2)])));
  });
  child.stdin.end();
});
const changeItems = shuffle(accepted.map((item, index) => ({ ...item, key: `C${index + 1}` })));
const change = changeItems.length ? await sol(join(outDir, "change"), [
  "Each item gives an ORIGINAL role-play reply and a REVISED version that was meant to change wording only. For each item answer whether the REVISED version changes, adds or drops:",
  "E = an event or action (what happens, who does what); K = what any character knows, learns or reveals; G = agency (who decides or acts, including anything said or done for the player's character); M = a mental state (a feeling, belief, intention or attitude). yes/no each.",
  "Answer exactly one line per item: <id> E=<yes|no> K=<yes|no> G=<yes|no> M=<yes|no>. No other text.", "",
  ...changeItems.flatMap((item) => [`### ${item.key}`, "ORIGINAL:", item.original, "REVISED:", item.polished, ""]),
].join("\n"), /^(C\d+)\s+E=(yes|no)\s+K=(yes|no)\s+G=(yes|no)\s+M=(yes|no)/gm) : new Map();
const prefItems = shuffle(accepted.map((item, index) => ({ ...item, key: `P${index + 1}`, polishedIs: rand() < 0.5 ? "A" : "B" })));
const pref = prefItems.length ? await sol(join(outDir, "preference"), [
  "Each item gives two versions, A and B, of one character's role-play reply. The characters' ways of speaking:", ...notes,
  "For each item pick the version that reads better as that character's reply (clearer, less stock phrasing, truer to the voice), or same if neither is better.",
  "Answer exactly one line per item: <id> <A|B|same>. No other text.", "",
  ...prefItems.flatMap((item) => [`### ${item.key} (speaker: ${item.speaker})`, "A:", item.polishedIs === "A" ? item.polished : item.original, "B:", item.polishedIs === "B" ? item.polished : item.original, ""]),
].join("\n"), /^(P\d+)\s+(A|B|same)\b/gm) : new Map();
const attrItems = shuffle(used.flatMap((item) => [{ ...item, version: "original", text: item.original }, { ...item, version: "polished", text: item.polished }]));
attrItems.forEach((item, index) => { item.key = `R${index + 1}`; });
const attr = attrItems.length ? await sol(join(outDir, "attribution"), [
  "You attribute role-play replies to their speaker. The names in each reply were replaced with [name]. The speaker is one of these characters:", ...notes,
  `For each reply answer with exactly one of: ${names.join(", ")}, unclear. Pick unclear if the voice does not tell you.`,
  `Answer exactly one line per item: <id> <${names.join("|")}|unclear>. No other text.`, "",
  ...attrItems.flatMap((item) => [`### ${item.key}`, strip(item.text), ""]),
].join("\n"), /^(R\d+)\s+(\S+)/gm) : new Map();
const changed = changeItems.filter((item) => (change.get(item.key) ?? []).includes("yes"));
const wins = prefItems.filter((item) => pref.get(item.key)?.[0] === item.polishedIs).length;
const correct = (version) => attrItems.filter((item) => item.version === version && attr.get(item.key)?.[0] === item.speaker).length;
const report = {
  status: used.length >= PLANNED ? "plan size" : `informational: ${used.length} of ${PLANNED} eligible replies`,
  runs: runs.length, eligibleFound: eligible.length, used: used.length, accepted: accepted.length, skipped,
  verdicts: Object.fromEntries([...EVALUATED].map((v) => [v, used.filter((item) => item.verdict === v).length])),
  zeroChange: { floor: "0 changed accepted outputs", changed: changed.length, of: accepted.length, unrated: changeItems.filter((item) => !change.has(item.key)).length,
    byKind: Object.fromEntries(["E", "K", "G", "M"].map((k, at) => [k, changeItems.filter((item) => change.get(item.key)?.[at] === "yes").length])) },
  preference: { floor: ">= 60 % polished preferred (ties count against)", polishedPreferred: wins, of: accepted.length, ties: prefItems.filter((item) => pref.get(item.key)?.[0] === "same").length, unrated: prefItems.filter((item) => !pref.has(item.key)).length },
  attribution: { floor: ">= 10 points over prevention-only", original: correct("original"), polished: correct("polished"), of: used.length, gainPoints: used.length ? Math.round(((correct("polished") - correct("original")) / used.length) * 1000) / 10 : null },
  rater: "opencode openai/gpt-6.1-sol",
  selfRating: "the polish route is opencode openai/gpt-6.1-sol too: the rater rates text it wrote (owner decision 2026-10-25); zero-change and preference are self-rated and informational",
};
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
