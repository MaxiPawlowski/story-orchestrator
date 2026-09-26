import { evidenceSources, normalizeEvidenceText } from "./evidence.ts";
import { readFileSync } from "node:fs";
const lines = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
const seen = new Set<string>();
for (const l of lines) {
  let o: any; try { o = JSON.parse(l); } catch { continue; }
  if (o.kind !== "audit") continue;
  const k = o.at + o.summary; if (seen.has(k)) continue; seen.add(k);
  const d = o.detail; const p: string = d.prompt ?? "";
  const t = p.indexOf("\nTranscript:\n"); if (t < 0) continue;
  const body = p.slice(t + 13);
  const parts = body.split(/\n(?=\[\d+\] [^\n:]{1,60}:)/);
  const msgs = parts.map((s) => { const m = s.match(/^\[(\d+)\] ([^:\n]+?):\s?([\s\S]*)$/); return m ? { messageId: +m[1], index: +m[1], speaker: m[2].replace(" (player)", ""), isUser: m[2].includes("(player)"), text: m[3] } : null; }).filter(Boolean) as any[];
  for (const r of d.rejected ?? []) {
    if (r.reason !== "evidence not in window") continue;
    const m = r.line.match(/evidence=(["'])(.*)\1\s*$/); if (!m) continue;
    const q = m[2];
    const raw = evidenceSources(q, msgs);
    const stripped = evidenceSources(q, msgs.map((x) => ({ ...x, text: x.text.replace(/\*/g, "") })));
    console.log(o.at.slice(11, 19), JSON.stringify(d.window), "asIs=" + JSON.stringify(raw), "starsStripped=" + JSON.stringify(stripped), q.slice(0, 70));
  }
}
