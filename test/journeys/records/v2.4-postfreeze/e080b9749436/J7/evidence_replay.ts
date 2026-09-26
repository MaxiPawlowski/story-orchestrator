import { evidenceSources, normalizeEvidenceText } from "./evidence.shipped.ts";
import { readFileSync } from "node:fs";
const lines = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
const seen = new Set<string>();
const all = new Map<number, any>();
const rows: any[] = [];
const parse = (p: string) => {
  const t = p.indexOf("\nTranscript:\n"); if (t < 0) return [];
  const body = p.slice(t + 13);
  return body.split(/\n(?=\[\d+\] [^\n:]{1,60}:)/).map((s) => { const m = s.match(/^\[(\d+)\] ([^:\n]+?):\s?([\s\S]*)$/); return m ? { messageId: +m[1], index: +m[1], speaker: m[2].replace(" (player)", ""), isUser: m[2].includes("(player)"), text: m[3] } : null; }).filter(Boolean) as any[];
};
let rejectedTotal = 0; const reasons: Record<string, number> = {};
for (const l of lines) {
  let o: any; try { o = JSON.parse(l); } catch { continue; }
  if (o.kind !== "audit") continue;
  const k = o.at + o.summary; if (seen.has(k)) continue; seen.add(k);
  const d = o.detail; const msgs = parse(d.prompt ?? "");
  for (const m of msgs) all.set(m.messageId, m);
  for (const r of d.rejected ?? []) {
    rejectedTotal++; reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    if (r.reason !== "evidence not in window") continue;
    const m = r.line.match(/evidence=(["'])(.*)\1\s*$/);
    rows.push({ at: o.at, window: d.window, trigger: d.trigger ?? d.reason, line: r.line, quote: m?.[2] ?? null, msgs });
  }
}
const out: any[] = [];
for (const r of rows) {
  const inWin = r.quote == null ? null : evidenceSources(r.quote, r.msgs);
  const anyChat = r.quote == null ? null : evidenceSources(r.quote, [...all.values()]);
  const qn = r.quote ? normalizeEvidenceText(r.quote) : "";
  const perMsgWordHits = r.msgs.filter((m: any) => { const t = normalizeEvidenceText(m.text); return qn.split(" ").filter((w: string) => w.length > 3).some((w: string) => t.includes(w)); }).map((m: any) => m.messageId);
  out.push({ at: r.at, window: r.window, inWindowShipped: inWin, anyChatShipped: anyChat, windowIds: r.msgs.map((m: any) => m.messageId), wordOverlapMsgs: perMsgWordHits, line: r.line });
}
console.log(JSON.stringify({ auditsSeen: seen.size, rejectedTotal, reasons, evidenceNotInWindow: rows.length, rows: out }, null, 1));
