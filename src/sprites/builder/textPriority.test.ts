import { waitForTextPriority } from "./textPriority";

test("another look render waits until every active and queued text request has cleared", async () => {
  const statuses = [{ activeText: 1, waitingText: 2 }, { activeText: 0, waitingText: 1 }, { activeText: 1, waitingText: 0 }, { activeText: 0, waitingText: 0 }];
  let time = 0;
  const sleep = jest.fn(async () => { time += 500; });
  await waitForTextPriority({ status: async () => statuses.shift() ?? null, current: () => true, now: () => time, sleep, signal: new AbortController().signal });
  expect(sleep).toHaveBeenCalledTimes(3);
});

test("a superseded look and an overdue text queue cannot start an edit", async () => {
  const controller = new AbortController();
  const deps = { status: async () => ({ waitingText: 1 }), current: () => true, now: () => 0, sleep: async () => {}, signal: controller.signal };
  await expect(waitForTextPriority({ ...deps, current: () => false })).rejects.toThrow("look changed");
  await expect(waitForTextPriority(deps, 0)).rejects.toThrow("deferred");
  controller.abort();
  await expect(waitForTextPriority(deps)).rejects.toThrow();
});
