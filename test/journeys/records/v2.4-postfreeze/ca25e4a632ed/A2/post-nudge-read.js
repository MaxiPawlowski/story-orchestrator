const rt = globalThis.storyOrchestratorRuntime;
const snap = rt.getSnapshot();
const prompt = ctx.extensionPrompts?.story_copilot_nudge;
return { chatId: ctx.chatId, groupId: ctx.groupId, chatLength: ctx.chat?.length, storyId: snap.storyId, snapshotActiveNudge: snap.activeNudge ?? null, getActiveNudge: rt.getActiveNudge(), extensionPromptNudge: prompt ? String(prompt.value ?? '') : null, storyKeys: Object.keys(ctx.extensionPrompts ?? {}).filter((k) => k.startsWith('story_')) };
