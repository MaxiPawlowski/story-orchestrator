const cm = ctx.extensionSettings.connectionManager;
const i = cm.profiles.findIndex((p) => p.name === 'SO-V2406 CC Artemis');
let removed = null;
if (i >= 0) { removed = cm.profiles.splice(i, 1)[0]; await ctx.eventSource.emit(ctx.eventTypes.CONNECTION_PROFILE_DELETED, removed); }
await ctx.executeSlashCommandsWithOptions('/profile Artemis RunPod RP', { handleParserErrors: false });
const o = (await import('/scripts/openai.js')).oai_settings;
o.custom_url = 'http://localhost:1234/v1';
o.custom_model = 'E:\models\huggingface\PygmalionAI\Mythalion-Kimiko-v2_Q5_1_8K\Mythalion-Kimiko-v2_Q5_1_8K.gguf';
o.custom_include_body = '';
for (const [sel, v] of [['#custom_api_url_text', o.custom_url], ['#custom_model_id', o.custom_model], ['#custom_include_body', '']]) { const el = document.querySelector(sel); if (el) el.value = v; }
const orig = window.fetch; let status = null;
window.fetch = async function (url) { const r = await orig.apply(this, arguments); if (String(url).includes('/api/settings/save')) status = r.status; return r; };
try { await (await import('/script.js')).saveSettings(); } finally { window.fetch = orig; }
const file = JSON.parse((await (await fetch('/api/settings/get', { method: 'POST', headers: ctx.getRequestHeaders(), body: '{}' })).json()).settings);
return { removed: removed?.name ?? null, saveStatus: status, mainApi: ctx.mainApi, selected: cm.profiles.find((p) => p.id === cm.selectedProfile)?.name, profiles: cm.profiles.map((p) => p.name), file: { source: file.oai_settings?.chat_completion_source, custom_url: file.oai_settings?.custom_url, custom_model: file.oai_settings?.custom_model, custom_include_body: file.oai_settings?.custom_include_body, preset: file.oai_settings?.preset_settings_openai, main_api: file.main_api, profiles: file.extension_settings?.connectionManager?.profiles?.map((p) => p.name) } };
