import { groupProfiles, hostOf, isPrivateHost, profileLocality, vendorLabel, type GroupableProfile } from "./profileGroups";

const tc = (id: string, source: string, apiUrl?: string): GroupableProfile => ({ id, name: id, kind: "text", source, apiUrl });
const cc = (id: string, source: string, apiUrl?: string, model?: string): GroupableProfile => ({ id, name: id, kind: "chat", source, apiUrl, model });

describe("v2.7 14 / 02 C14: the role picker grouped by source, labelled cloud or local", () => {
  it("a self-hosted text backend on a loopback or LAN address is local; on a public host it is cloud", () => {
    expect(profileLocality(tc("a", "llamacpp", "http://127.0.0.1:18080"))).toBe("local");
    expect(profileLocality(tc("b", "koboldcpp", "192.168.50.130:5001"))).toBe("local");
    expect(profileLocality(tc("c", "llamacpp", "https://abc-8080.proxy.runpod.net"))).toBe("cloud");
    expect(profileLocality(tc("d", "ollama"))).toBe("local");
  });

  it("a hosted text service is cloud whatever its address", () => {
    expect(profileLocality(tc("a", "openrouter", "http://127.0.0.1:1"))).toBe("cloud");
    expect(profileLocality(tc("b", "togetherai"))).toBe("cloud");
  });

  it("a chat completion source is cloud, except a custom endpoint on a private address", () => {
    expect(profileLocality(cc("ds", "deepseek"))).toBe("cloud");
    expect(profileLocality(cc("cl", "claude", "http://localhost:9"))).toBe("cloud");
    expect(profileLocality(cc("cu", "custom", "http://localhost:1234/v1"))).toBe("local");
    expect(profileLocality(cc("cu2", "custom", "https://api.example.com/v1"))).toBe("cloud");
    expect(profileLocality(cc("cu3", "custom"))).toBe("cloud");
  });

  it("a profile whose API the host could not resolve is unknown, never claimed local", () => {
    expect(profileLocality({ id: "x", name: "x" })).toBe("unknown");
  });

  it("groups by source and locality: local first, then cloud, then unresolved; profile order kept inside a group", () => {
    const groups = groupProfiles([
      cc("ds-flash", "deepseek"), tc("artemis", "llamacpp", "http://127.0.0.1:18080"), { id: "odd", name: "odd" },
      cc("ds-pro", "deepseek"), cc("lm", "custom", "http://127.0.0.1:1235/v1"), tc("pod", "llamacpp", "https://p-8080.proxy.runpod.net"),
    ]);
    expect(groups.map((group) => [group.label, group.profiles.map((profile) => profile.id)])).toEqual([
      ["Custom (OpenAI-compatible) · local", ["lm"]],
      ["llama.cpp · local", ["artemis"]],
      ["DeepSeek · cloud", ["ds-flash", "ds-pro"]],
      ["llama.cpp · cloud", ["pod"]],
      ["Connection profiles", ["odd"]],
    ]);
  });

  it("an unlisted source keeps its own key as the vendor", () => {
    expect(vendorLabel("brand-new-source")).toBe("brand-new-source");
    expect(vendorLabel(undefined)).toBe("Other");
  });

  it("hosts parse with or without a scheme, and only private ranges count as local", () => {
    expect(hostOf("127.0.0.1:8080")).toBe("127.0.0.1");
    expect(hostOf("https://[::1]:8080/x")).toBe("[::1]");
    expect(hostOf("::not a url::")).toBeNull();
    expect(["localhost", "10.0.0.2", "172.20.1.1", "192.168.1.5", "box.local", "[::1]"].every(isPrivateHost)).toBe(true);
    expect(["172.32.0.1", "8.8.8.8", "api.deepseek.com", "192.169.0.1"].some(isPrivateHost)).toBe(false);
  });
});
