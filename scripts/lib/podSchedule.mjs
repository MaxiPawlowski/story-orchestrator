export const POD_SESSIONS = ['B1', 'C'];

export const sessionOf = (row) => (row.stage === 'B1' ? 'B1' : 'C');

export const needsPod = (row) => row.tier.includes('RP') && row.reset !== 'offline';

export function resetMinutes(kind, estimates, snapshot) {
  const entry = estimates.resetMinutes?.[kind];
  if (!entry) return 0;
  return snapshot ? entry.snapshot : entry.seed;
}

export function podJobs(manifest, estimates, { snapshot = true, branches = 'all', split = true, shares = false } = {}) {
  const rows = manifest.rows;
  const ids = new Set(rows.map((row) => row.id));
  const problems = [];
  for (const id of Object.keys(estimates.rows ?? {})) if (!ids.has(id)) problems.push(`estimate for ${id}, which is not a manifest row`);
  const shared = shares ? estimates.shares ?? {} : {};
  for (const [id, share] of Object.entries(estimates.shares ?? {})) if (!ids.has(id) || (share.host && !ids.has(share.host))) problems.push(`share ${id} -> ${share.host ?? share.lane}: not a manifest row`);
  const jobs = [];
  const offPod = [];
  for (const row of rows) {
    if (!needsPod(row)) {
      if (row.tier.includes('RP')) offPod.push(row.id);
      continue;
    }
    if (row.branch && branches === 'none') continue;
    if (shared[row.id]) {
      offPod.push(row.id);
      continue;
    }
    const estimate = estimates.rows?.[row.id];
    if (Array.isArray(estimate?.derivedFrom)) {
      for (const source of estimate.derivedFrom) if (!ids.has(source)) problems.push(`${row.id} is scored from ${source}, which is not a manifest row`);
      offPod.push(row.id);
      continue;
    }
    if (!estimate || !(estimate.runMin > 0)) {
      problems.push(`${row.id} needs the pod and has no runMin estimate`);
      continue;
    }
    for (const dep of estimate.after ?? []) if (!ids.has(dep)) problems.push(`${row.id} waits for ${dep}, which is not a manifest row`);
    const units = split ? Math.max(1, estimate.units ?? 1) : 1;
    const reset = resetMinutes(row.reset, estimates, snapshot);
    for (let unit = 1; unit <= units; unit += 1) {
      jobs.push({
        id: units > 1 ? `${row.id}#${unit}/${units}` : row.id,
        row: row.id,
        session: sessionOf(row),
        reset: row.reset,
        comfy: row.reset === 'comfy',
        minutes: 2 * (reset + estimate.runMin / units),
        after: (estimate.after ?? []).filter((dep) => ids.has(dep)),
        branch: row.branch ?? null,
        samePod: units > 1 && estimate.samePod === true,
      });
    }
  }
  return { jobs, offPod, problems };
}

export function schedule(jobs, { pods, lanesPerPod = 2, podStartMin = 0, podStopMin = 0 }) {
  const lanes = [];
  for (let pod = 0; pod < pods; pod += 1) for (let slot = 0; slot < lanesPerPod; slot += 1) lanes.push({ pod, slot, free: podStartMin, queue: [] });
  const rowEnd = new Map();
  const rowPod = new Map();
  const rowUnitsLeft = new Map();
  for (const job of jobs) rowUnitsLeft.set(job.row, (rowUnitsLeft.get(job.row) ?? 0) + 1);
  const pending = [...jobs];
  let comfyFree = 0;
  const problems = [];
  while (pending.length) {
    const ready = pending.filter((job) => job.after.every((dep) => !rowUnitsLeft.has(dep) || rowUnitsLeft.get(dep) === 0));
    if (!ready.length) {
      problems.push(`dependency cycle or wait on an unscheduled row: ${pending.map((job) => job.id).join(', ')}`);
      break;
    }
    let best = null;
    for (const job of ready) {
      const depEnd = Math.max(0, ...job.after.map((dep) => rowEnd.get(dep) ?? 0));
      for (const lane of lanes) {
        if (job.samePod && rowPod.has(job.row) && rowPod.get(job.row) !== lane.pod) continue;
        const start = Math.max(lane.free, depEnd, job.comfy ? comfyFree : 0);
        if (!best || start < best.start || (start === best.start && job.minutes > best.job.minutes)) best = { job, lane, start };
      }
    }
    const { job, lane, start } = best;
    const end = start + job.minutes;
    lane.queue.push({ id: job.id, row: job.row, start, end });
    lane.free = end;
    if (job.comfy) comfyFree = end;
    rowEnd.set(job.row, Math.max(rowEnd.get(job.row) ?? 0, end));
    if (!rowPod.has(job.row)) rowPod.set(job.row, lane.pod);
    rowUnitsLeft.set(job.row, rowUnitsLeft.get(job.row) - 1);
    pending.splice(pending.indexOf(job), 1);
  }
  const podEnds = Array.from({ length: pods }, (_, pod) => Math.max(podStartMin, ...lanes.filter((lane) => lane.pod === pod).map((lane) => lane.free)));
  const used = podEnds.filter((end, pod) => lanes.some((lane) => lane.pod === pod && lane.queue.length));
  const wallMin = jobs.length ? Math.max(...podEnds) + podStopMin : 0;
  const podMin = used.reduce((sum, end) => sum + end + podStopMin, 0);
  const laneMin = jobs.reduce((sum, job) => sum + job.minutes, 0);
  return { pods, wallMin, podMin, laneMin, podsUsed: used.length, lanes, problems };
}

export function plan(manifest, estimates, { pods, snapshot = true, branches = 'all', split = true, shares = false, rate = estimates.ratePerHour ?? 0.72 }) {
  const { jobs, offPod, problems } = podJobs(manifest, estimates, { snapshot, branches, split, shares });
  const sessions = POD_SESSIONS.map((name) => ({ name, ...schedule(jobs.filter((job) => job.session === name), { pods, lanesPerPod: estimates.lanesPerPod ?? 2, podStartMin: estimates.podStartMin ?? 0, podStopMin: estimates.podStopMin ?? 0 }) }));
  const podHours = sessions.reduce((sum, session) => sum + session.podMin, 0) / 60;
  const wallHours = sessions.reduce((sum, session) => sum + session.wallMin, 0) / 60;
  return { pods, snapshot, split, branches, shares, sessions, podHours, wallHours, usd: podHours * rate, offPod, problems: [...problems, ...sessions.flatMap((session) => session.problems)] };
}

const hours = (minutes) => (minutes / 60).toFixed(1);

export function planTable(plans) {
  const lines = ['| Pods | Model lanes | B1 wall h | C wall h | Wall h (pod time) | Pod-hours | USD |', '|---|---|---|---|---|---|---|'];
  for (const p of plans) {
    const [b1, c] = p.sessions;
    lines.push(`| ${p.pods} | ${p.pods * 2} | ${hours(b1.wallMin)} | ${hours(c.wallMin)} | ${p.wallHours.toFixed(1)} | ${p.podHours.toFixed(1)} | ${p.usd.toFixed(2)} |`);
  }
  return lines.join('\n');
}

export function laneQueues(p) {
  return p.sessions.flatMap((session) => session.lanes.filter((lane) => lane.queue.length).map((lane) => `${session.name} pod ${lane.pod} lane ${lane.slot + 1} (${hours(lane.free)} h): ${lane.queue.map((entry) => entry.id).join(' → ')}`)).join('\n');
}
