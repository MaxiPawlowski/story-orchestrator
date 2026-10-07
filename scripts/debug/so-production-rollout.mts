import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withST } from './lib/cli.mts';
import { ensureSTReady } from './lib/st-ready.mts';
import { openGroup, startNewChat, closeUnpinnedDrawers } from './st-navigation.mts';
import { sendCompactMessage, triggerGroupMember } from './st-actions.mts';
import { dismissBriefing } from './lib/briefingHarness.mts';
import { argValue } from './lib/imageHarness.mts';

const group = argValue(process.argv.slice(2), '--group', "Adolion - The Adventurer's Road");

await mkdir(resolve('test/sessions/evidence/measurements-v2.7/main-rollout'), { recursive: true });
const report: any = { at: new Date().toISOString(), ok: false };
try {
    await withST(async (page) => {
        report.errors = [];
        report.httpErrors = [];
        page.on('pageerror', (error) => report.errors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') report.errors.push(message.text().slice(0, 1000)); });
        page.on('response', (response) => { if (response.status() >= 400) report.httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
        const client = await page.context().newCDPSession(page);
        await client.send('Network.setCacheDisabled', { cacheDisabled: true });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await ensureSTReady(page);
        await page.waitForSelector('#story-orchestrator-settings', { state: 'attached', timeout: 30000 });
        const build = await page.evaluate(async () => {
            const prefix = '/scripts/extensions/third-party/story-orchestrator/dist/';
            const manifest = await (await fetch(`${prefix}manifest.json`, { cache: 'no-store' })).json();
            const data = Array.from(new Uint8Array(await (await fetch(`${prefix}index.js`, { cache: 'no-store' })).arrayBuffer()));
            const handles = ['storyOrchestratorRuntime', 'storyOrchestratorImage', 'storyOrchestratorSprites'].filter((key) => Boolean((globalThis as any)[key]));
            const ctx = (globalThis as any).SillyTavern.getContext();
            await ctx.getCharacters();
            return { expected: manifest.bundle.sha256, data, handles };
        });
        report.build = { sha256: createHash('sha256').update(Buffer.from(build.data)).digest('hex'), handles: build.handles };
        if (report.build.sha256 !== build.expected || !build.handles.includes('storyOrchestratorRuntime')) throw new Error('Served build identity failed.');
        if (process.argv[2] === 'probe') {
            await openGroup(page, group);
            await startNewChat(page);
            await page.waitForTimeout(10000);
            report.probe = await page.evaluate(() => {
                const ctx = (globalThis as any).SillyTavern.getContext();
                return { metadataKeys: Object.keys(ctx.chatMetadata), blob: ctx.chatMetadata.story_orchestrator ? { selected: ctx.chatMetadata.story_orchestrator.selectedStoryId, records: Object.keys(ctx.chatMetadata.story_orchestrator.stories ?? {}) } : null, hud: Boolean(document.querySelector('#so-hud')), settingsText: document.querySelector('#story-orchestrator-settings')?.textContent?.slice(0, 500) };
            });
            return;
        }
        await openGroup(page, group);
        await startNewChat(page);
        await page.waitForFunction(() => {
            const ctx = (globalThis as any).SillyTavern.getContext();
            return Boolean(document.querySelector('dialog#so-briefing[open]')) || ctx.chatMetadata.story_orchestrator?.selectedStoryId === 'adolion-adventurer';
        }, undefined, { polling: 250, timeout: 60000 });
        if (await page.locator('dialog#so-briefing[open]').count()) await dismissBriefing(page);
        await page.waitForFunction(() => (globalThis as any).SillyTavern.getContext().chatMetadata.story_orchestrator?.selectedStoryId === 'adolion-adventurer', undefined, { polling: 250, timeout: 60000 });
        await closeUnpinnedDrawers(page);
        await sendCompactMessage(page, 'I greet the people at the guild counter and ask what work is available today.');
        await triggerGroupMember(page, 'Adolion Narrator');
        await page.waitForFunction(() => {
            const ctx = (globalThis as any).SillyTavern.getContext();
            const blob = ctx.chatMetadata.story_orchestrator;
            const record = blob?.stories?.[blob.selectedStoryId];
            return record?.engineState?.boundary > 0 && record.extras?.extraction?.audits?.some((a: any) => a.rawResponse?.trim());
        }, undefined, { polling: 1000, timeout: 300000 });
        report.live = await page.evaluate(() => {
            const ctx = (globalThis as any).SillyTavern.getContext();
            const blob = ctx.chatMetadata.story_orchestrator, record = blob.stories[blob.selectedStoryId];
            const reply = ctx.chat.at(-1);
            if (!reply?.mes?.trim() || reply.is_user) throw new Error('Production reply is empty.');
            return { storyId: blob.selectedStoryId, hash: record.contentHashAtLoad, boundary: record.engineState.boundary, replyLength: reply.mes.length, audits: record.extras.extraction.audits.length };
        });
        await page.waitForTimeout(5000);
        await page.waitForFunction(async () => {
            const modulePath = '/script.js';
            const host = await import(modulePath);
            return !host.isChatSaving;
        }, undefined, { polling: 250, timeout: 30000 });
        await startNewChat(page);
        await page.waitForFunction(() => {
            const ctx = (globalThis as any).SillyTavern.getContext();
            return ctx.chatMetadata.story_orchestrator?.selectedStoryId === 'adolion-adventurer';
        }, undefined, { polling: 500, timeout: 30000 });
        report.readyChat = await page.evaluate(() => {
            const ctx = (globalThis as any).SillyTavern.getContext();
            const blob = ctx.chatMetadata.story_orchestrator, record = blob.stories[blob.selectedStoryId];
            return { chatId: ctx.chatId, groupId: ctx.groupId, storyId: blob.selectedStoryId, hash: record.contentHashAtLoad, pinned: Boolean(record.pinnedStory?.briefing), playerMessages: ctx.chat.filter((m: any) => m.is_user).length, briefingOpen: Boolean(document.querySelector('dialog#so-briefing[open]')) };
        });
        if (report.readyChat.playerMessages || !report.readyChat.pinned) throw new Error('The ready-to-play chat is not fresh.');
        await page.screenshot({ path: resolve('test/sessions/evidence/measurements-v2.7/main-rollout/production-ready.png') });
        await client.detach();
        report.ok = true;
    });
} catch (error) { report.error = String(error); process.exitCode = 1; }
await writeFile(resolve('test/sessions/evidence/measurements-v2.7/main-rollout/production.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
