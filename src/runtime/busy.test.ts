import { BusyWork } from "./busy";
import { busyText } from "./pipeline";

describe("busy work lifecycle", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it("keeps concurrent jobs independent, scopes them to their chat, and stops ticking after the last settles", () => {
    const work = new BusyWork();
    const notify = jest.fn();
    work.subscribe(notify);
    const first = work.begin("setup", "a", 120);
    const second = work.begin("model", "b");
    first.progress(120);
    expect(busyText(work.view("a"))).toBe("Setting up the story… 120 of 120 cast");
    expect(busyText(work.view("b"))).toBeNull();
    jest.advanceTimersByTime(11000);
    expect(busyText(work.view("b"))).toBe("Still working · 11s");
    first.end();
    expect(work.view("a")).toEqual([]);
    expect(work.view("b")).toHaveLength(1);
    second.end();
    const settled = notify.mock.calls.length;
    jest.advanceTimersByTime(2000);
    expect(notify).toHaveBeenCalledTimes(settled);
    expect(jest.getTimerCount()).toBe(0);
  });
});
