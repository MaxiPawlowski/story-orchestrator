import { noulOf, systemOne } from '../lib/client.mts';
import { expectedFinal, loadFixtureCases, loadHardCases, msgId, type ExtractionCase, type Primitive, type QualityDef } from '../lib/story.mts';
import { auroc, binaryAccuracy, frac, fixed, pct, table, type BinaryRow } from '../lib/stats.mts';
import type { Experiment } from './types.mts';

interface Leaf { caseId: string; quality: string; value: Primitive; label: boolean; kind: 'shown' | 'contradicts' | 'not-shown' }

const phrase = (value: Primitive) => (typeof value === 'boolean' ? (value ? 'yes' : 'no') : `"${value}"`);

export const leafQuestion = (quality: QualityDef, value: Primitive) => `Does \`transcript\` show that the answer to "${quality.rubric}" is ${phrase(value)}?`;

function leavesFor(entry: ExtractionCase): Leaf[] {
  const leaves: Leaf[] = [];
  for (const key of entry.ask) {
    const quality = entry.qualities[key];
    if (quality.type !== 'bool' && quality.type !== 'enum') continue;
    const final = expectedFinal(quality, entry.expected[key] ?? null, entry.prior[key]);
    const shown = entry.expected[key] !== null && entry.expected[key] !== undefined && final?.length;
    if (quality.type === 'bool') {
      if (shown) {
        const value = final![0] as boolean;
        leaves.push({ caseId: entry.id, quality: key, value, label: true, kind: 'shown' });
        leaves.push({ caseId: entry.id, quality: key, value: !value, label: false, kind: 'contradicts' });
      } else {
        leaves.push({ caseId: entry.id, quality: key, value: entry.prior[key] === true ? false : true, label: false, kind: 'not-shown' });
      }
      continue;
    }
    const values = quality.values ?? [];
    if (shown) {
      const accepted = final!.map(String);
      leaves.push({ caseId: entry.id, quality: key, value: accepted[0], label: true, kind: 'shown' });
      const other = values.find((candidate) => !accepted.includes(candidate) && candidate !== 'unknown');
      if (other) leaves.push({ caseId: entry.id, quality: key, value: other, label: false, kind: 'contradicts' });
    } else {
      const other = values.find((candidate) => candidate !== entry.prior[key] && candidate !== 'unknown');
      if (other) leaves.push({ caseId: entry.id, quality: key, value: other, label: false, kind: 'not-shown' });
    }
  }
  return leaves;
}

// v2.2 plan 06 Phase A: the stall pre-check phrases a gate leaf from the quality's rubric and the
// value the gate wants. The spike's gate-leaf set phrased leaves directly, so this shape is new.
export const stallLeaves: Experiment = {
  id: 'stall-leaves',
  title: 'Stall pre-check leaves (rubric + value) — v2.2 plan 06 Phase A',
  async run() {
    const cases = [...loadHardCases(), ...loadFixtureCases()];
    const rows: Array<Leaf & { p: number }> = [];
    await Promise.all(cases.map(async (entry) => {
      const leaves = leavesFor(entry);
      if (!leaves.length) return;
      const state = { transcript: entry.transcript.map((message) => ({ id: msgId(message.index), speaker: message.speaker, text: message.text })) };
      const questions = Object.fromEntries(leaves.map((leaf, index) => [`leaf:${index}`, { type: 'noul' as const, instructions: leafQuestion(entry.qualities[leaf.quality], leaf.value) }]));
      const record = await systemOne({ state, questions }, { tag: `stall-leaves:${entry.id}` });
      leaves.forEach((leaf, index) => rows.push({ ...leaf, p: noulOf(record, `leaf:${index}`) }));
    }));
    rows.sort((a, b) => a.caseId.localeCompare(b.caseId, undefined, { numeric: true }) || a.quality.localeCompare(b.quality));
    const binary: BinaryRow[] = rows.map((row) => ({ p: row.p, label: row.label }));
    const direct = rows.filter((row) => row.p >= 0.9);
    const genuineMisses = rows.filter((row) => row.label && row.p < 0.1);
    const kinds = ['shown', 'contradicts', 'not-shown'] as const;
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${rows.length} leaves over ${new Set(rows.map((row) => row.caseId)).size} cases: ${rows.filter((row) => row.label).length} shown, ${rows.filter((row) => !row.label).length} not (contradicted or never shown).`,
        `AUROC ${fixed(auroc(binary))} (floor 0.95), accuracy at 0.5 ${pct(binaryAccuracy(binary))}.`,
        `Direct delta at p ≥ 0.9: ${frac(direct.filter((row) => row.label).length, direct.length)} right. Shown leaves the pre-check would call a genuine stall (p < 0.1): ${genuineMisses.length}${genuineMisses.length ? ` (${genuineMisses.map((row) => `${row.caseId}.${row.quality}`).join(', ')})` : ''}.`,
      ],
      sections: [
        { title: 'By kind', body: table(['kind', 'n', 'mean p', 'right at 0.5'], kinds.map((kind) => {
          const list = rows.filter((row) => row.kind === kind);
          return [kind, list.length, fixed(list.reduce((sum, row) => sum + row.p, 0) / (list.length || 1)), `${list.filter((row) => (row.p >= 0.5) === row.label).length}/${list.length}`];
        })) },
        { title: 'Every leaf', body: table(['case', 'quality', 'value', 'kind', 'p'], rows.map((row) => [row.caseId, row.quality, String(row.value), row.kind, `${fixed(row.p)}${(row.p >= 0.5) === row.label ? '' : ' ✗'}`])) },
      ],
      data: rows,
    };
  },
};
