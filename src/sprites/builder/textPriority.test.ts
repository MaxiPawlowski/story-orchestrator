import { leaseOutsideTurns, outsideTurns, waitForTextPriority } from "./textPriority";

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

test("a broker that schedules images fairly gets the request at once: it gives queued text its window and then the image its own", async () => {
  let time = 0;
  const sleep = jest.fn(async () => { time += 500; });
  await waitForTextPriority({ status: async () => ({ activeText: 1, waitingText: 4, fairImages: true }), current: () => true, now: () => time, sleep, signal: new AbortController().signal });
  expect(sleep).not.toHaveBeenCalled();
});

test("a loud generation holds the render even when the broker is fair or silent; it starts once ST stops generating", async () => {
  let time = 0, loud = 3;
  const sleep = jest.fn(async () => { time += 500; loud -= 1; });
  await waitForTextPriority({ status: async () => ({ fairImages: true }), loud: async () => loud > 0, current: () => true, now: () => time, sleep, signal: new AbortController().signal });
  expect(sleep).toHaveBeenCalledTimes(3);
  loud = 1;
  sleep.mockClear();
  await waitForTextPriority({ status: async () => null, loud: async () => loud > 0, current: () => true, now: () => time, sleep, signal: new AbortController().signal });
  expect(sleep).toHaveBeenCalledTimes(1);
});

test("a lease granted while a reply started is handed back and taken again once the reply is over", async () => {
  const loud = [true, false, true, false, false], events: string[] = [];
  let leases = 0;
  const lease = await leaseOutsideTurns({ acquire: async () => { events.push("acquire"); return ++leases; }, release: async (held) => { events.push(`release ${held}`); },
    loud: async () => loud.shift() ?? false, sleep: async () => { events.push("sleep"); }, signal: new AbortController().signal });
  expect(lease).toBe(2);
  expect(events).toEqual(["sleep", "acquire", "release 1", "acquire"]);
});

test("waiting out a reply stops when the render is cancelled", async () => {
  const controller = new AbortController();
  const acquire = jest.fn(async () => 1);
  const waiting = leaseOutsideTurns({ acquire, release: async () => {}, loud: async () => true, sleep: async () => { controller.abort(); }, signal: controller.signal });
  await expect(waiting).rejects.toThrow();
  expect(acquire).not.toHaveBeenCalled();
});

test("a render under a lease the batch already holds still waits out a reply before it is submitted", async () => {
  const loud = [true, true, false], events: string[] = [];
  await outsideTurns({ loud: async () => { events.push("check"); return loud.shift() ?? false; }, sleep: async () => { events.push("sleep"); }, signal: new AbortController().signal });
  expect(events).toEqual(["check", "sleep", "check", "sleep", "check"]);
  const controller = new AbortController();
  await expect(outsideTurns({ loud: async () => true, sleep: async () => { controller.abort(); }, signal: controller.signal })).rejects.toThrow();
});
