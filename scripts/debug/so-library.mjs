// Inspect Story Orchestrator's story library from extensionSettings.
//
// Data lives at: extensionSettings["story-orchestrator"].studio
// Shape: { stories: StoredStoryRecord[], lastSelectedKey }
//   StoredStoryRecord: { id, name, story, updatedAt, meta? }
//   story: Story schema with checkpoints[], transitions[], etc.

import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';

export async function dumpStoryLibrary(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const ext = ctx.extensionSettings?.['story-orchestrator'];
    const studio = ext?.studio;
    if (!studio?.stories) return { stories: [], lastSelectedKey: null };

    const stories = studio.stories.map((record) => {
      const s = record.story || {};
      const checkpoints = Array.isArray(s.checkpoints) ? s.checkpoints : [];
      const transitions = Array.isArray(s.transitions) ? s.transitions : [];
      return {
        id: record.id,
        name: record.name,
        checkpointCount: checkpoints.length,
        transitionCount: transitions.length,
        updatedAt: record.updatedAt
          ? new Date(record.updatedAt).toISOString()
          : null,
        meta: record.meta ?? null,
      };
    });

    return {
      stories,
      lastSelectedKey: studio.lastSelectedKey ?? null,
    };
  });
}

export async function dumpStory(page, storyId) {
  return evaluateInST(page, (id) => {
    const ctx = SillyTavern.getContext();
    const ext = ctx.extensionSettings?.['story-orchestrator'];
    const studio = ext?.studio;
    if (!studio?.stories) return null;

    const record = studio.stories.find((s) => s.id === id);
    if (!record) return null;

    return {
      id: record.id,
      name: record.name,
      story: record.story,
      updatedAt: record.updatedAt
        ? new Date(record.updatedAt).toISOString()
        : null,
      meta: record.meta ?? null,
    };
  }, storyId);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser;
    try {
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;
      await ensureSTReady(page);

      const storyId = process.argv[2];

      if (storyId) {
        const data = await dumpStory(page, storyId);
        if (!data) {
          console.error(`Story "${storyId}" not found in library.`);
          process.exitCode = 1;
          return;
        }
        console.log(JSON.stringify(data, null, 2));
        await writeJSON(data, `so-story-${storyId}`);
      } else {
        const data = await dumpStoryLibrary(page);
        console.log(JSON.stringify(data, null, 2));
        await writeJSON(data, 'so-library');
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) browser.close();
    }
  })();
}
