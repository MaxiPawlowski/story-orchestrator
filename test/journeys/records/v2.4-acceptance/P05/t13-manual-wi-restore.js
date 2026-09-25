const root = ctx.extensionSettings['story-orchestrator'];
const before = JSON.parse(JSON.stringify(root.settings.worldInfo));
root.settings.worldInfo = { gatingMode: 'file', normalized: {} };
const orig = window.fetch; let status = null;
window.fetch = async function (url) { const r = await orig.apply(this, arguments); if (String(url).includes('/api/settings/save')) status = r.status; return r; };
try { await (await import('/script.js')).saveSettings(); } finally { window.fetch = orig; }
return { before, after: root.settings.worldInfo, saveStatus: status };
