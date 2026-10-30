import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [onDump, offDump, frozenPath, outDir, prefix = 'so-v29-c2'] = process.argv.slice(2);
const read = (path) => { const raw = JSON.parse(readFileSync(path, 'utf8')); return raw.value ?? raw; };
const frozen = JSON.parse(readFileSync(frozenPath, 'utf8'));
const cues = frozen.opportunities.filter((o) => o.cue);
const arms = { on: read(onDump), off: read(offDump) };
const items = [];
for (const arm of ['on', 'off']) for (const o of cues) {
  const row = arms[arm][`${prefix}${arm}-${o.id}`];
  if (!row) throw new Error(`missing ${arm} ${o.id}`);
  items.push({ arm, id: o.id, member: o.member, cue: o.cue, mes: row.mes, offered: row.offered ?? null });
}
let seed = 20261023;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
for (let i = items.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
items.forEach((item, index) => { item.key = `R${index + 1}`; });
const prompt = [
  "You rate role-play replies. Each item gives an event note and the reply a character wrote. The note is a rating aid: the speaker may or may not have been shown it. The player's character is Max Nightriver (the player may also be addressed as 'you').",
  'For each item answer:',
  "U = does the reply clearly use or acknowledge the note's content (reacts to it, mentions it, or shows it happening)? yes/no",
  "P = does the reply narrate actions, speech, thoughts or feelings of the player's character (Max / 'you') that the player did not write? yes/no",
  'Answer exactly one line per item: <id> U=<yes|no> P=<yes|no>. No other text.',
  '',
  ...items.flatMap((item) => [`### ${item.key}`, `EVENT NOTE (a rating aid; the speaker may or may not have been shown it): "${item.cue}"`, 'REPLY:', item.mes, '']),
].join('\n');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'prompt.txt'), prompt);
writeFileSync(join(outDir, 'key.json'), JSON.stringify(items.map(({ key, arm, id, member, offered }) => ({ key, arm, id, member, offered })), null, 1));
const config = JSON.stringify({ $schema: 'https://opencode.ai/config.json', agent: { 'so-judge': { mode: 'primary', prompt: 'You are a careful, impartial reader of roleplay fiction.', tools: { '*': false }, permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' } } } });
const answer = await new Promise((done, fail) => {
  const child = spawn('C:/Users/RolaPorElNapo/bin/opencode/opencode.exe', ['run', '--standalone', '--format', 'json', '--agent', 'so-judge', '-m', 'openai/gpt-6.1-sol', '--file', join(outDir, 'prompt.txt'), 'Rate every item in the attached file exactly as its instructions say. Output only the answer lines.'], { cwd: outDir, env: { ...process.env, OPENCODE_CONFIG_CONTENT: config }, windowsHide: true });
  let stdout = '';
  child.stdout.on('data', (c) => { stdout += c; });
  let stderr = ''; child.stderr.on('data', (c) => { stderr += c; }); child.stdin.on('error', () => {});
  const timer = setTimeout(() => child.kill(), 600000);
  child.on('close', (code) => { clearTimeout(timer); code === 0 ? done(stdout) : fail(new Error(`opencode exited ${code}: ${stderr.slice(0, 500)}`)); });
  child.stdin.end();
});
const text = answer.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((e) => e?.type === 'text').map((e) => e.part?.text ?? '').join('');
writeFileSync(join(outDir, 'answer.txt'), text);
const verdicts = new Map([...text.matchAll(/^(R\d+)\s+U=(yes|no)\s+P=(yes|no)/gm)].map((m) => [m[1], { U: m[2], P: m[3] }]));
const rows = items.map((item) => ({ key: item.key, arm: item.arm, id: item.id, member: item.member, offered: item.offered, ...(verdicts.get(item.key) ?? { U: null, P: null }) }));
const count = (arm, field) => rows.filter((r) => r.arm === arm && r[field] === 'yes').length;
const report = {
  items: rows.length, unrated: rows.filter((r) => r.U === null).length,
  U_on: { yes: count('on', 'U'), of: 30 }, U_off: { yes: count('off', 'U'), of: 30 },
  cue_effect_pp: Math.round(((count('on', 'U') - count('off', 'U')) / 30) * 1000) / 10,
  C5: { playerNarration: rows.filter((r) => r.P === 'yes').map((r) => `${r.arm}:${r.id}`), of: 60 },
  offered: { on: rows.filter((r) => r.arm === 'on' && r.offered).length, off: rows.filter((r) => r.arm === 'off' && r.offered).length },
  perMember: Object.fromEntries(['luke', 'ponticius', 'arin'].map((m) => [m, { on: rows.filter((r) => r.arm === 'on' && r.member === m && r.U === 'yes').length, off: rows.filter((r) => r.arm === 'off' && r.member === m && r.U === 'yes').length }])),
  rows,
};
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, rows: undefined }, null, 1));
