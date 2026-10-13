import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [kind, ...args] = process.argv.slice(2);
const read = (file: string): any[] => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
const rate = (hit: number, total: number) => total ? Number((hit / total).toFixed(3)) : null;
const out: Record<string, unknown> = { kind };

if (kind === 'pose-dense') {
    const [arm, ...files] = args;
    const a = { bodies: 0, same: 0, yes: 0, partly: 0, no: 0, crops: 0, label: 0, samefaceSheets: 0, faceN: 0, defects: {} as Record<string, number> };
    const byPose: Record<string, { n: number; same: number; yes: number; labelN: number; label: number }> = {};
    let failed = 0, sheets = 0;
    for (const file of files) for (const row of read(file)) {
        if (row.failed) { failed += 1; continue; }
        if (!row.key || !row.rating) continue;
        sheets += 1;
        if (String(row.key).endsWith('-dense-bodies')) {
            for (const [pose, v] of Object.entries<any>(row.rating)) {
                const s = (byPose[pose] ??= { n: 0, same: 0, yes: 0, labelN: 0, label: 0 });
                a.bodies += 1; s.n += 1; a.same += v.same_character ? 1 : 0; s.same += v.same_character ? 1 : 0;
                if (v.pose_matches === 'yes') { a.yes += 1; s.yes += 1; } else if (v.pose_matches === 'partly') a.partly += 1; else a.no += 1;
                for (const d of v.defects ?? []) a.defects[d] = (a.defects[d] ?? 0) + 1;
            }
        } else {
            for (const crop of row.rating.crops ?? []) {
                const pose = String(crop.caption).split(' ')[0];
                const s = (byPose[pose] ??= { n: 0, same: 0, yes: 0, labelN: 0, label: 0 });
                a.crops += 1; a.label += crop.label_visible ? 1 : 0; s.labelN += 1; s.label += crop.label_visible ? 1 : 0;
            }
            a.faceN += 1; a.samefaceSheets += row.rating.same_face_across ? 1 : 0;
        }
    }
    out.arm = arm; out.sheets = sheets; out.failed = failed;
    out.total = { bodies: a.bodies, identity: rate(a.same, a.bodies), poseYes: a.yes, posePartly: a.partly, poseNo: a.no, defects: a.defects, crops: a.crops, labelVisible: rate(a.label, a.crops), sameFaceSheets: `${a.samefaceSheets}/${a.faceN}` };
    out.byPose = Object.fromEntries(Object.entries(byPose).map(([pose, s]) => [pose, { identity: rate(s.same, s.n), poseYes: `${s.yes}/${s.n}`, labelVisible: rate(s.label, s.labelN) }]));
} else if (kind === 'pose') {
    const arms: Record<string, any> = {};
    let failed = 0, sheets = 0;
    const byPose: Record<string, { same: number; n: number; label: number; labelN: number }> = {};
    for (const file of args) for (const row of read(file)) {
        if (row.failed) { failed += 1; continue; }
        if (!row.key || !row.rating) continue;
        sheets += 1;
        const pose = String(row.key).split('/').at(-1)!.replace(/^m\d-/, '').replace(/-(bodies|heads)$/, '');
        const slot = (byPose[pose] ??= { same: 0, n: 0, label: 0, labelN: 0 });
        if (String(row.key).endsWith('-bodies')) {
            for (const [arm, value] of Object.entries<any>(row.rating)) {
                const a = (arms[arm] ??= { n: 0, same: 0, poseYes: 0, posePartly: 0, poseNo: 0, defects: {}, label: 0, labelN: 0 });
                a.n += 1; a.same += value.same_character ? 1 : 0;
                slot.n += 1; slot.same += value.same_character ? 1 : 0;
                if (value.pose_matches === 'yes') a.poseYes += 1; else if (value.pose_matches === 'partly') a.posePartly += 1; else a.poseNo += 1;
                for (const d of value.defects ?? []) a.defects[d] = (a.defects[d] ?? 0) + 1;
            }
        } else {
            for (const crop of row.rating.crops ?? []) {
                const arm = String(crop.caption).split(' ')[0];
                const a = (arms[arm] ??= { n: 0, same: 0, poseYes: 0, posePartly: 0, poseNo: 0, defects: {}, label: 0, labelN: 0 });
                a.labelN += 1; a.label += crop.label_visible ? 1 : 0;
                slot.labelN += 1; slot.label += crop.label_visible ? 1 : 0;
            }
        }
    }
    out.sheets = sheets; out.failed = failed;
    out.arms = Object.fromEntries(Object.entries(arms).map(([arm, a]) => [arm, { bodies: a.n, identity: rate(a.same, a.n), poseYes: a.poseYes, posePartly: a.posePartly, poseNo: a.poseNo, defects: a.defects, crops: a.labelN, labelVisible: rate(a.label, a.labelN) }]));
    out.byPose = Object.fromEntries(Object.entries(byPose).map(([pose, s]) => [pose, { identity: rate(s.same, s.n), labelVisible: rate(s.label, s.labelN) }]));
} else if (kind === 'pack') {
    const [mapDir, ...files] = args;
    const arms: Record<string, any> = {};
    const pair: Record<string, { win: number; n: number }> = {};
    let failed = 0;
    for (const file of files) for (const row of read(file)) {
        if (row.failed) { failed += 1; continue; }
        if (!row.rating?.rows) continue;
        const key = String(row.key).replace(/^pack\//, '');
        const map = JSON.parse(readFileSync(path.join(mapDir, `${key}.map.json`), 'utf8')) as Record<string, string>;
        for (const [label, value] of Object.entries<any>(row.rating.rows)) {
            const arm = map[label];
            const a = (arms[arm] ??= { sets: 0, consistent: 0, same: 0, sameN: 0, view: 0, viewN: 0, clean: 0, cleanN: 0 });
            a.sets += 1; a.consistent += value.consistent_within_row ? 1 : 0;
            for (const v of value.same_as_reference ?? []) { a.sameN += 1; a.same += v ? 1 : 0; }
            for (const v of value.view_ok ?? []) { a.viewN += 1; a.view += v ? 1 : 0; }
            for (const v of value.clean ?? []) { a.cleanN += 1; a.clean += v ? 1 : 0; }
        }
        for (const column of row.rating.rank_by_column ?? []) {
            const names = (column as string[]).map((label) => map[label]);
            for (let i = 0; i < names.length; i += 1) for (let j = i + 1; j < names.length; j += 1) {
                const k = `${names[i]}>${names[j]}`;
                const rev = `${names[j]}>${names[i]}`;
                (pair[k] ??= { win: 0, n: 0 }).win += 1; (pair[k]).n += 1;
                (pair[rev] ??= { win: 0, n: 0 }).n += 1;
            }
        }
    }
    out.failed = failed;
    out.arms = Object.fromEntries(Object.entries(arms).map(([arm, a]) => [arm, { sets: a.sets, consistentWithinPack: rate(a.consistent, a.sets), sameAsReference: rate(a.same, a.sameN), viewOk: rate(a.view, a.viewN), clean: rate(a.clean, a.cleanN) }]));
    out.preference = Object.fromEntries(Object.entries(pair).sort().map(([k, v]) => [k, { wins: v.win, pairs: v.n, rate: rate(v.win, v.n) }]));
} else if (kind === 'chain') {
    const groups: Record<string, any> = {};
    let failed = 0;
    for (const file of args) {
        const name = path.basename(path.dirname(file));
        for (const row of read(file)) {
            if (row.failed) { failed += 1; continue; }
            if (!row.key || !row.rating) continue;
            const g = (groups[name] ??= { cropsSame: 0, crops: 0, label: 0, labelN: 0, artifact: 0, baseSame: 0, baseFull: 0, lookSame: 0, lookApplied: 0, bodies: 0, scenes: 0, sceneOk: 0, sceneA: 0, sceneB: 0, merged: 0, text: 0, labelBy: {} as Record<string, number[]> });
            const r = row.rating;
            if (String(row.key).startsWith('chain-heads')) {
                for (const [label, c] of Object.entries<any>(r.crops ?? {})) {
                    g.crops += 1; g.cropsSame += c.same_character ? 1 : 0; g.labelN += 1; g.label += c.label_visible ? 1 : 0; g.artifact += c.artifact ? 1 : 0;
                    const by = (g.labelBy[label] ??= [0, 0]); by[1] += 1; by[0] += c.label_visible ? 1 : 0;
                }
            } else if (String(row.key).startsWith('chain-body')) {
                g.bodies += 1; g.baseSame += r.base_same_character ? 1 : 0; g.baseFull += r.base_full_body ? 1 : 0; g.lookSame += r.look_same_character ? 1 : 0; g.lookApplied += r.look_applied ? 1 : 0;
            } else if (String(row.key).startsWith('chain-scene')) {
                g.scenes += 1; g.sceneOk += r.both_present ? 1 : 0; g.sceneA += r.a_same_character ? 1 : 0; g.sceneB += r.b_same_character ? 1 : 0; g.merged += r.merged ? 1 : 0; g.text += r.text_or_watermark ? 1 : 0;
            }
        }
    }
    out.failed = failed;
    out.groups = Object.fromEntries(Object.entries(groups).map(([name, g]) => [name, {
        headCropIdentity: rate(g.cropsSame, g.crops), labelVisible: rate(g.label, g.labelN), labelBy: Object.fromEntries(Object.entries<number[]>(g.labelBy).map(([k, v]) => [k, `${v[0]}/${v[1]}`])), artifacts: g.artifact,
        baseIdentity: rate(g.baseSame, g.bodies), baseFullBody: rate(g.baseFull, g.bodies), lookIdentity: rate(g.lookSame, g.bodies), lookApplied: rate(g.lookApplied, g.bodies),
        sceneBothPresent: `${g.sceneOk}/${g.scenes}`, sceneA: `${g.sceneA}/${g.scenes}`, sceneB: `${g.sceneB}/${g.scenes}`, sceneMerged: g.merged, sceneText: g.text }]));
} else throw new Error('usage: so-pose-s0-summarise.mts pose|pack|chain ...');

console.log(JSON.stringify(out, null, 2));
