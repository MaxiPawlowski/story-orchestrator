import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mainRequest, runR4Turn } from './r4Live.mts';
import { pairProblems, type R4Turn } from './r4Pack.mts';
import { r4Fake, type R4FakeOptions } from './r4Fakes.mts';

const turn = (patch: Partial<R4Turn> = {}): R4Turn => ({ id: 't01', story: 'Story A', storyId: 'story-a', checkpoint: 'climax', chatId: 'chat-1', member: 'Narrator', contextMessages: 2, ...patch });

const withFake = async (options: R4FakeOptions, body: (fake: ReturnType<typeof r4Fake>) => Promise<void>) => {
  const fake = r4Fake(options);
  fake.install();
  try { await body(fake); } finally { fake.uninstall(); }
};

test('a turn generates control and arm in the seeded order, proves the key, and leaves chat and flag as found', async () => {
  await withFake({}, async (fake) => {
    const record = await runR4Turn(fake.page, turn(), { armFirst: true, deps: fake.deps });
    assert.deepEqual(record.generations.map((generation) => generation.side), ['arm', 'control']);
    assert.deepEqual(record.context, [{ name: 'Narrator', text: 'The gate looms.' }, { name: 'Player', text: 'I push the gate open.' }]);
    assert.equal(fake.state.chat.length, 2);
    assert.equal(fake.state.flag, false);
    assert.deepEqual(fake.state.flagWrites, [true, false, false]);
    assert.deepEqual(fake.state.triggers, ['/trigger await=true "Narrator"', '/trigger await=true "Narrator"']);
    const [arm, control] = record.generations;
    assert.equal(arm.payload.reasoningEffort, 'high');
    assert.equal(control.payload.reasoningEffort, null);
    assert.ok(arm.shot);
    assert.equal(control.shot, null);
    assert.deepEqual([arm.reply, control.reply], ['The gate gives way, take 1.', 'The gate gives way, take 2.']);
    assert.deepEqual(pairProblems(record), []);
  });
});

test('control first when the coin says so, and a solo turn triggers without a member', async () => {
  await withFake({}, async (fake) => {
    const record = await runR4Turn(fake.page, turn({ member: null }), { armFirst: false, deps: fake.deps });
    assert.deepEqual(record.generations.map((generation) => generation.side), ['control', 'arm']);
    assert.deepEqual(fake.state.triggers, ['/trigger await=true', '/trigger await=true']);
  });
});

test('a custom source proves the arm through enable_thinking in the merged include body', async () => {
  await withFake({ source: 'custom' }, async (fake) => {
    const record = await runR4Turn(fake.page, turn(), { armFirst: true, deps: fake.deps });
    assert.deepEqual(record.generations.map((generation) => generation.payload.enableThinking), [true, false]);
    assert.deepEqual(pairProblems(record), []);
  });
});

test('a turn refuses before generating when the chat, story, checkpoint, declaration or spike is wrong', async () => {
  const cases: Array<[R4FakeOptions, Partial<R4Turn>, RegExp]> = [
    [{ chatId: 'chat-9' }, {}, /open chat is chat-9, the turn declares chat-1/],
    [{ storyId: 'story-b' }, {}, /story is story-b/],
    [{ checkpoint: 'cp1' }, {}, /active checkpoint is cp1/],
    [{ declared: null }, {}, /declares effects\.reasoning null, the arm needs "high"/],
    [{ declared: 'low' }, {}, /declares effects\.reasoning "low"/],
    [{ spikeLoaded: false }, {}, /spike is not loaded/],
    [{}, { contextMessages: 9 }, /asks for 9 of context/],
  ];
  for (const [options, patch, re] of cases) {
    await withFake(options, async (fake) => {
      await assert.rejects(runR4Turn(fake.page, turn(patch), { armFirst: true, deps: fake.deps }), re);
      assert.deepEqual(fake.state.triggers, []);
    });
  }
});

test('a generation that posts no reply fails the turn, deletes nothing and still restores the flag', async () => {
  await withFake({ silent: true }, async (fake) => {
    await assert.rejects(runR4Turn(fake.page, turn(), { armFirst: true, deps: fake.deps }), /expected one character reply, the chat went 2 -> 2/);
    assert.equal(fake.state.chat.length, 2);
    assert.equal(fake.state.flag, false);
  });
});

test('a planted run where the arm key did not land is recorded and its pair is invalid', async () => {
  await withFake({ landed: () => false }, async (fake) => {
    const record = await runR4Turn(fake.page, turn(), { armFirst: true, deps: fake.deps });
    assert.match(pairProblems(record).join(';'), /the arm key did not land/);
  });
});

test('mainRequest takes the loud generate, not a connection-profile or quiet call around it', () => {
  const entries = [
    { url: '/api/backends/chat-completions/generate', parsedBody: { messages: [] } },
    { url: '/api/plugins/x', parsedBody: { type: 'normal' } },
    { url: '/api/backends/chat-completions/generate', parsedBody: { type: 'normal', reasoning_effort: 'high' } },
    { url: '/api/backends/chat-completions/generate', parsedBody: { type: 'quiet' } },
  ];
  assert.deepEqual(mainRequest(entries), { type: 'normal', reasoning_effort: 'high' });
  assert.equal(mainRequest(entries.filter((entry) => (entry.parsedBody as { type?: string }).type !== 'normal')), null);
});
