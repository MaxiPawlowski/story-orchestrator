/**
 * @jest-environment jsdom
 */
jest.mock("./context", () => ({ getContext: () => ({ chatMetadata: {} }) }));
jest.mock("./modules", () => ({ backgroundsModule: { background_settings: { name: "" } } }));
jest.mock("./slashCommands", () => ({ executeSlashCommands: async () => true }));

import { readBackgroundLayer, watchBackgroundLayer } from "./backgrounds";

const INN = "url(\"backgrounds/inn.jpg\")";
const ROAD = "url(\"backgrounds/road.jpg\")";

describe("background layer read (sprite motion crossfade)", () => {
  beforeEach(() => { document.body.innerHTML = "<div id=\"bg1\"></div>"; });

  it("reads the inline image ST wrote and reports each switch once, never writing to #bg1", async () => {
    const bg = document.getElementById("bg1") as HTMLElement;
    expect(readBackgroundLayer()).toBeNull();
    bg.style.backgroundImage = INN;
    expect(readBackgroundLayer()?.image).toBe(INN);
    const seen: Array<[string | undefined, string | undefined]> = [];
    const stop = watchBackgroundLayer((previous, next) => seen.push([previous?.image, next?.image]));
    bg.style.backgroundImage = ROAD;
    await Promise.resolve();
    bg.className = "cover";
    await Promise.resolve();
    expect(seen).toEqual([[INN, ROAD]]);
    stop();
    bg.style.backgroundImage = INN;
    await Promise.resolve();
    expect(seen).toHaveLength(1);
    expect(bg.getAttribute("style")).toBe(`background-image: ${INN};`);
  });

  it("without #bg1 the watcher is inert", () => {
    document.body.innerHTML = "";
    expect(readBackgroundLayer()).toBeNull();
    expect(typeof watchBackgroundLayer(() => undefined)).toBe("function");
  });
});
