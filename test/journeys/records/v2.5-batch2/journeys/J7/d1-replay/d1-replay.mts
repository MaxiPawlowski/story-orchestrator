// D1 method (plan 05 F0 A5): rebuild each audit's window from its prompt, replay every rejected
// "evidence not in window" line and every quote through evidenceSources (a copy of src/extraction/evidence.ts,
// PLAYER_MARK inlined; source.sha256 pins the original).
// usage: node --experimental-strip-types d1-replay.mts <journal-follow.jsonl>... [--user Max] --out <file.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { evidenceSources } from './evidence.copy.mts';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const out = flag('--out');
const user = flag('--user') ?? 'Max';
const files = args;

type Msg = { messageId: number; index: number; speaker: string; isUser: boolean; text: string };
const windowOf = (prompt: string, from: number, to: number): Msg[] => {
  const at = prompt.lastIndexOf('\nTranscript:\n');
  if (at < 0) return [];
  const body = prompt.slice(at + '\nTranscript:\n'.length);
  const heads = [...body.matchAll(/^\[(\d+)\] ([^\n]*?)(?: \(player\))?: /gm)].filter((m) => { const n = Number(m[1]); return n >= from && n <= to; });
  const msgs: Msg[] = [];
  let last = -1;
  const kept = heads.filter((m) => { const n = Number(m[1]); if (n <= last) return false; last = n; return true; });
  kept.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < kept.length ? (kept[i + 1].index ?? body.length) - 1 : body.length;
    const marked = m[0].includes(' (player): ');
    msgs.push({ messageId: Number(m[1]), index: Number(m[1]), speaker: m[2], isUser: marked || m[2] === user, text: body.slice(start, end) });
  });
  return msgs;
};
const evidenceOf = (line: string) => line.match(/evidence=(["'])([\s\S]*)\1\s*$/)?.[2] ?? line.match(/evidence="([\s\S]*)$/)?.[1] ?? '';
const labelOf = (evidence: string) => evidence.match(/^\s*(?:\[(\d+)\]\s*)?([^:\[\]"]{1,40}?)\s*(?:\(player\))?\s*:/);
const ownLabel = (evidence: string, msgs: Msg[], sources: number[]) => {
  const m = evidence.match(/^\s*\[(\d+)\]\s*([^:]{1,40}?)\s*(?:\(player\))?\s*:/);
  if (!m) return false;
  const msg = msgs.find((x) => x.index === Number(m[1]));
  return Boolean(msg && msg.speaker.trim() === m[2].trim() && sources.includes(msg.messageId));
};

const seen = new Set<string>();
const rows: any[] = [];
let audits = 0, quotes = 0, ownLabelled = 0;
for (const file of files) {
  for (const raw of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let d: any; try { d = JSON.parse(raw); } catch { continue; }
    if (d.kind !== 'audit' || !d.detail?.prompt) continue;
    const det = d.detail;
    const key = `${d.chatId}|${det.reason}|${det.window?.from}-${det.window?.to}|${d.at}`;
    if (seen.has(key)) continue; seen.add(key);
    audits += 1;
    const msgs = windowOf(det.prompt, det.window?.from ?? 0, det.window?.to ?? 1e9);
    const items = [
      ...(det.accepted ?? []).map((a: any) => ({ kind: 'accepted', line: `DELTA q=${a.q} value=${JSON.stringify(a.v)}`, evidence: a.evidence ?? '', reason: null })),
      ...(det.rejected ?? []).map((r: any) => ({ kind: 'rejected', line: r.line, evidence: evidenceOf(r.line ?? ''), reason: r.reason })),
    ];
    for (const item of items) {
      if (!item.evidence) continue;
      quotes += 1;
      const sources = evidenceSources(item.evidence, msgs);
      const labelled = labelOf(item.evidence);
      const own = ownLabel(item.evidence, msgs, sources);
      if (own) ownLabelled += 1;
      if (item.kind === 'rejected' && item.reason === 'evidence not in window' || labelled || own) {
        rows.push({ chatId: d.chatId, at: d.at, reason: det.reason, window: det.window, windowParsed: msgs.map((m) => m.index), kind: item.kind, rejectReason: item.reason, line: item.line, evidence: item.evidence, replaySources: sources, carriesLabel: Boolean(labelled), ownLineLabel: own, labelIndex: labelled?.[1] ?? null, labelSpeaker: labelled?.[2] ?? null });
      }
    }
  }
}
const notInWindow = rows.filter((r) => r.kind === 'rejected' && r.rejectReason === 'evidence not in window');
const replayFinds = notInWindow.filter((r) => r.replaySources.length > 0);
const summary = {
  files, audits, quotes,
  notInWindowRejections: notInWindow.length,
  replayFindsAmongRejections: replayFinds.length,
  quotesCarryingOwnLineLabel: ownLabelled,
  quotesCarryingAnyLabel: rows.filter((r) => r.carriesLabel).length,
  criterionA_zeroReplayFinds: replayFinds.length === 0,
  criterionB_atLeastOneOwnLabel: ownLabelled >= 1,
  verdict: replayFinds.length === 0 ? (ownLabelled >= 1 ? 'green' : 'not exercised') : 'red',
};
writeFileSync(out ?? 'd1-replay.out.json', JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
