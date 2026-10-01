import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ensureCast } from './sessionCast.mts';
import { fakePage, fakeSt, install, uninstall } from './sessionFakes.mts';

afterEach(() => uninstall());

const night = (honour = true) => {
  const fake = fakeSt({ characters: ['Adolion Narrator', 'Belle', 'Dalan', 'Kayla', 'Erevan', 'Zariah'].map((name) => ({ name, avatar: `${name.toLowerCase().replace(/ /g, '-')}.png` })) as any });
  fake.ctx.groups = [{ id: 'g1', name: 'Adolion - Night', members: fake.ctx.characters.map((character: any) => character.avatar), disabled_members: ['kayla.png', 'erevan.png'] }];
  fake.ctx.executeSlashCommandsWithOptions = async (command: string) => {
    fake.ctx.slash.push(command);
    if (!honour) return { pipe: '' };
    const match = /^\/member-(enable|disable) "(.+)"$/.exec(command);
    const avatar = fake.ctx.characters.find((character: any) => character.name === match?.[2])?.avatar;
    const group = fake.ctx.groups[0];
    group.disabled_members = match?.[1] === 'enable' ? group.disabled_members.filter((entry: string) => entry !== avatar) : [...group.disabled_members, avatar];
    return { pipe: '' };
  };
  install(fake);
  return fake;
};

test('T1-5: a card that starts at Kelger Falls has Kayla and Erevan enabled, through the host command, and verified', async () => {
  const fake = night();
  const result = await ensureCast(fakePage(), { enabled: ['Kayla', 'Erevan', 'Zariah'] });
  assert.deepEqual(result, { ok: true, changed: ['+Kayla', '+Erevan'], problems: [], disabledAfter: [] });
  assert.deepEqual(fake.ctx.slash, ['/member-enable "Kayla"', '/member-enable "Erevan"']);
});

test('T1-5: start fails closed when the host does not apply the change', async () => {
  night(false);
  const result = await ensureCast(fakePage(), { enabled: ['Kayla'] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ['Kayla is still disabled after /member-enable']);
});

test('T1-5: a name the group does not hold is a problem, never a silent skip', async () => {
  night();
  const result = await ensureCast(fakePage(), { enabled: ['Kayla'], disabled: ['Camilla'] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, ['Camilla is not a member of Adolion - Night']);
});

test('control: nothing to change sends no command', async () => {
  const fake = night();
  const result = await ensureCast(fakePage(), { enabled: ['Belle'], disabled: ['Kayla'] });
  assert.deepEqual({ ok: result.ok, changed: result.changed, slash: fake.ctx.slash }, { ok: true, changed: [], slash: [] });
});
