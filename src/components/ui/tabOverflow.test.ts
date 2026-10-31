import { tabOverflow } from "./Tabs";

describe("tab row scroll hint (v3.0 29 phone Author tabs)", () => {
  it("names the side with hidden tabs", () => {
    expect(tabOverflow({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toBeUndefined();
    expect(tabOverflow({ scrollLeft: 0, scrollWidth: 600, clientWidth: 300 })).toBe("end");
    expect(tabOverflow({ scrollLeft: 300, scrollWidth: 600, clientWidth: 300 })).toBe("start");
    expect(tabOverflow({ scrollLeft: 120, scrollWidth: 600, clientWidth: 300 })).toBe("both");
    expect(tabOverflow({ scrollLeft: 0.5, scrollWidth: 300.5, clientWidth: 300 })).toBeUndefined();
  });
});
