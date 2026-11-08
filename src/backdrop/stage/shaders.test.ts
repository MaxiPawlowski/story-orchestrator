import * as shaders from "./shaders";

const RESERVED = ["half", "fixed", "input", "output", "filter", "sample", "sizeof", "cast", "namespace", "using", "long", "short", "double", "unsigned", "superp", "active", "common", "partition"];
const SOURCES = Object.entries(shaders).filter(([name]) => name.endsWith("_VS") || name.endsWith("_FS"));

describe("v3.0 45 A: backdrop shaders stay valid GLSL ES 3.00", () => {
  it("each starts with the version line", () => {
    expect(SOURCES.filter(([, source]) => !(source as string).startsWith("#version 300 es\n")).map(([name]) => name)).toEqual([]);
  });

  it("uses no reserved word as an identifier", () => {
    const found = SOURCES.flatMap(([name, source]) => RESERVED.filter((word) => new RegExp(`\\b${word}\\b`).test(source as string)).map((word) => `${name}: ${word}`));
    expect(found).toEqual([]);
  });

  it("declares an int uniform shared by the particle stages at one precision", () => {
    expect(shaders.PARTICLE_VS).toMatch(/precision highp float;[\s\S]*uniform int uKind;/);
    expect(shaders.PARTICLE_FS).toContain("uniform highp int uKind;");
  });
});
