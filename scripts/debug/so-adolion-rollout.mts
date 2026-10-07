import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withST } from './lib/cli.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { parseGroupScript } from './lib/adolionFresh.mts';
import { openGroup, startNewChat, closeUnpinnedDrawers } from './st-navigation.mts';
import { sendCompactMessage, triggerGroupMember } from './st-actions.mts';
import { dismissBriefing } from './lib/briefingHarness.mts';

const mode = process.argv[2] ?? 'inventory';
if (!['inventory', 'import', 'smoke', 'image'].includes(mode)) throw new Error('Use inventory, import, smoke or image.');
const campaign = 'C:/dev/adolion-campaign';
const directory = resolve('test/measurements/v2.7/main-rollout');
await mkdir(directory, { recursive: true });
const files = (await readdir(`${campaign}/build/story`)).filter((name) => name.endsWith('.story.json')).sort();
const stories = await Promise.all(files.map(async (name) => JSON.parse(await readFile(`${campaign}/build/story/${name}`, 'utf8'))));
if (stories.length !== 9) throw new Error('Expected all nine campaign stories.');
const groups = parseGroupScript(await readFile(`${campaign}/build/st-groups.js`, 'utf8'));
const report: any = { at: new Date().toISOString(), mode, lane: process.env.SO_LANE ?? 'main', ok: false };
try {
    await withST(async (page) => {
        if (mode === 'image') {
            report.image = await page.evaluate(async () => {
                const ctx = (globalThis as any).SillyTavern.getContext();
                const rt = (globalThis as any).storyOrchestratorRuntime;
                if (!ctx.groupId || rt.getSnapshot().storyId !== 'adolion-adventurer') throw new Error('Open the rollout smoke chat first.');
                const path = await (globalThis as any).storyOrchestratorImage.direct({ purpose: 'scene', text: 'A quiet view of the guild hall and its counter, without characters.', messageId: ctx.chat.length - 1 });
                if (!path) throw new Error('No image was saved.');
                const response = await fetch(path);
                if (!response.ok) throw new Error('Saved illustration is unavailable.');
                const blob = await response.blob();
                const bitmap = await createImageBitmap(blob);
                const result = { saved: true, bytes: blob.size, width: bitmap.width, height: bitmap.height };
                bitmap.close();
                return result;
            });
            await triggerGroupMember(page, 'Adolion Narrator');
            report.recovery = await page.evaluate(() => {
                const ctx = (globalThis as any).SillyTavern.getContext();
                const s = (globalThis as any).storyOrchestratorRuntime.getSnapshot();
                const last = ctx.chat.at(-1);
                if (!last?.mes?.trim() || last.is_user) throw new Error('Text did not recover after rendering.');
                return { replyLength: last.mes.length, boundary: s.boundary };
            });
        }
        if (mode === 'import') {
            await page.evaluate(async (stories) => {
                const ctx = (globalThis as any).SillyTavern.getContext();
                const rt = (globalThis as any).storyOrchestratorRuntime;
                if (ctx.chatId || ctx.groupId) throw new Error('Library rollout requires the welcome screen, preserving existing chats.');
                for (const story of stories) {
                    const result = await rt.importStory(JSON.stringify(story));
                    if (result?.ok === false) throw new Error(`Import refused: ${story.id}`);
                }
            }, stories);
            report.save = await saveSettingsNow(page);
        }
        if (mode === 'smoke') {
            const saved = await page.evaluate(() => {
                const ctx = (globalThis as any).SillyTavern.getContext();
                const settings = ctx.extensionSettings['story-orchestrator'].settings;
                const profile = ctx.extensionSettings.connectionManager.profiles.find((p: any) => p.name === 'Artemis Local (Unsloth)');
                if (!profile || profile.api !== 'llamacpp' || profile['api-url'] !== 'http://127.0.0.1:18888') throw new Error('Local reply profile is not pinned to the managed controller.');
                const prior = { image: settings.image.enabled, sprites: settings.sprites.enabled, onDemand: settings.sprites.onDemand, selected: ctx.extensionSettings.connectionManager.selectedProfile };
                settings.image.enabled = false;
                settings.sprites.enabled = true;
                settings.sprites.onDemand = false;
                for (const key of Object.keys(globalThis)) if (key.startsWith('storyOrchestratorDebug')) delete (globalThis as any)[key];
                return prior;
            });
            try {
                await saveSettingsNow(page);
                await page.evaluate(async () => {
                    const modulePath = '/scripts/slash-commands.js';
                    const slash = await import(modulePath);
                    await slash.executeSlashCommandsWithOptions('/profile "Artemis Local (Unsloth)"');
                });
                await openGroup(page, "Adolion - The Adventurer's Road");
                await startNewChat(page);
                if (await page.locator('dialog#so-briefing[open]').count()) await dismissBriefing(page);
                await closeUnpinnedDrawers(page);
                report.before = await page.evaluate(() => {
                    const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
                    const s = rt.getSnapshot();
                    if (!ctx.chatId || !ctx.groupId || s.storyId !== 'adolion-adventurer' || !s.requirements.ready) throw new Error('Fresh bound story is not ready.');
                    return { chatId: ctx.chatId, storyId: s.storyId, boundary: s.boundary, auditCount: s.extraction.audits.length, briefing: Boolean(rt.getPlayedStoryRaw()?.briefing) };
                });
                await sendCompactMessage(page, 'I look around the guild hall and greet the people at the counter. What work is available today?');
                await triggerGroupMember(page, 'Adolion Narrator');
                await page.evaluate(async () => {
                    const rt = (globalThis as any).storyOrchestratorRuntime;
                    await rt.runExtractionNow(undefined, 'main-rollout-smoke');
                });
                await page.waitForFunction(() => (globalThis as any).storyOrchestratorRuntime.getSnapshot().extraction.audits.some((a: any) => a.reason === 'main-rollout-smoke' && a.rawResponse?.trim()), undefined, { polling: 1000, timeout: 300000 });
                report.after = await page.evaluate(() => {
                    const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
                    const s = rt.getSnapshot(), reply = ctx.chat.at(-1);
                    const audit = s.extraction.audits.find((a: any) => a.reason === 'main-rollout-smoke');
                    if (!s.boundary || !reply?.mes?.trim() || reply.is_user || !audit?.prompt?.trim() || !audit.rawResponse?.trim()) throw new Error('Real reply/read/boundary evidence missing.');
                    const actors = (globalThis as any).storyOrchestratorSprites?.view()?.actors ?? [];
                    return { storyId: s.storyId, boundary: s.boundary, replyLength: reply.mes.length, auditCount: s.extraction.audits.length, realRead: true, actors: actors.map((a: any) => ({ name: a.name, set: a.set })) };
                });
                await page.waitForTimeout(3000);
                await page.evaluate(async () => {
                    const modulePath = '/scripts/group-chats.js';
                    const gc = await import(modulePath);
                    const ctx = (globalThis as any).SillyTavern.getContext();
                    await gc.openGroupChat(ctx.groupId, ctx.chatId);
                });
                report.reopened = await page.evaluate(() => {
                    const s = (globalThis as any).storyOrchestratorRuntime.getSnapshot();
                    return { storyId: s.storyId, boundary: s.boundary, ready: s.requirements.ready };
                });
                if (report.reopened.storyId !== report.after.storyId || report.reopened.boundary !== report.after.boundary || !report.reopened.ready) throw new Error('Reopen did not preserve the played state.');
            } finally {
                await page.evaluate((saved) => {
                    const settings = (globalThis as any).SillyTavern.getContext().extensionSettings['story-orchestrator'].settings;
                    settings.image.enabled = saved.image;
                    settings.sprites.enabled = saved.sprites;
                    settings.sprites.onDemand = saved.onDemand;
                }, saved);
                await saveSettingsNow(page);
            }
        }
        report.inventory = await page.evaluate(async ({ stories, groups }) => {
            const ctx = (globalThis as any).SillyTavern.getContext();
            const modulePath = '/scripts/group-chats.js';
            const gc = await import(modulePath);
            const root = ctx.extensionSettings['story-orchestrator'];
            const rows = stories.map((story: any) => {
                const library = root.v2Stories.find((r: any) => r.id === story.id);
                const spec = groups.find((g: any) => g.story === story.id)!;
                const group = gc.groups.find((g: any) => g.name === spec.name);
                const missing = spec.members.filter((avatar: string) => !ctx.characters.some((c: any) => c.avatar === avatar) || !group?.members.includes(avatar));
                return { id: story.id, expected: story.version, installed: library?.version, briefing: Boolean(story.briefing), bound: Boolean(group && root.groupStories[String(group.id)] === story.id), missingMembers: missing.length };
            });
            const problems = rows.filter((r: any) => r.expected !== r.installed || !r.bound || r.missingMembers || !r.briefing);
            return { rows, problems: problems.length, count: rows.length };
        }, { stories, groups });
        if (report.inventory.problems) throw new Error('Campaign inventory does not match the current build.');
        report.ok = true;
    });
} catch (error) { report.error = String(error); process.exitCode = 1; }
const output = resolve(directory, `${report.lane}-${mode}-${Date.now()}.json`);
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ok: report.ok, error: report.error, inventory: report.inventory, after: report.after, reopened: report.reopened }));
