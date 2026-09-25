const cm = ctx.extensionSettings.connectionManager;
const profiles = cm?.profiles ?? [];
const svc = ctx.ConnectionManagerRequestService;
const out = [];
for (const p of profiles) {
  const t = Date.now();
  try {
    const r = await svc.sendRequest(p.id, [{role:'user',content:'Reply with exactly: PONG'}], 16, {extractData:true,includePreset:true,includeInstruct:true,stream:false}, {});
    out.push({name: p.name, mode: p.mode, api: p.api, ms: Date.now()-t, content: String(r?.content ?? r).slice(0,60)});
  } catch (e) { out.push({name: p.name, ms: Date.now()-t, error: String(e?.message ?? e).slice(0,120)}); }
}
const s = ctx.extensionSettings['story-orchestrator']?.settings ?? {};
return { out, extraction: { enabled: s.extraction?.enabled, cadence: s.extraction?.cadence, profileId: s.extraction?.profileId, stabilityLag: s.extraction?.stabilityLag }, stagecraft: s.stagecraft, judge: s.judge, stepped: ctx.extensionSettings['st-stepped-thinking']?.is_enabled, steppedKeys: Object.keys(ctx.extensionSettings).filter(k=>/step/i.test(k)) };
