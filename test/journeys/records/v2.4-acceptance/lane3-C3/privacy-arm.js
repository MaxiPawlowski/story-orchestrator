if (!globalThis.__soPrivacyInstalled) {
  const orig = window.fetch;
  window.fetch = async function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input?.url;
      if (url && url.includes('story-orchestrator-judge/systemone')) {
        (globalThis.__soPrivacy ||= []).push({ at: new Date().toISOString(), url, body: JSON.parse(init?.body ?? 'null') });
      }
    } catch (e) { (globalThis.__soPrivacy ||= []).push({ at: new Date().toISOString(), parseError: String(e) }); }
    return orig.apply(this, arguments);
  };
  globalThis.__soPrivacyInstalled = true;
}
globalThis.__soPrivacy = [];
return { armed: true, chatId: ctx.chatId, groupId: ctx.groupId };
