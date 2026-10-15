import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeWorkspaceModal } from './so-ui.mts';

const fakePage = (open: boolean) => {
  const clicks: string[] = [];
  let isOpen = open;
  return {
    clicks,
    page: {
      locator: (selector: string) => ({
        count: async () => (selector === '#so-workspace-modal[open]' && isOpen ? 1 : 0),
        getByRole: (_role: string, { name }: { name: string }) => ({ click: async () => { clicks.push(name); isOpen = false; } }),
      }),
      waitForFunction: async () => undefined,
    } as any,
  };
};

test('assert-player-clean closes the Story Orchestrator modal it opened, so the next send reaches the chat', async () => {
  const fake = fakePage(true);
  assert.equal(await closeWorkspaceModal(fake.page), true);
  assert.deepEqual(fake.clicks, ['Close Story Orchestrator']);
});

test('nothing to close when the modal is not open', async () => {
  const fake = fakePage(false);
  assert.equal(await closeWorkspaceModal(fake.page), false);
  assert.deepEqual(fake.clicks, []);
});
