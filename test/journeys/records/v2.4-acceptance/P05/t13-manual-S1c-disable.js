const m = await import('/scripts/extensions.js');
const before = [...SillyTavern.getContext().extensionSettings.disabledExtensions];
setTimeout(() => m.disableExtension('third-party/story-orchestrator', true), 50);
return { disabling: true, before };
