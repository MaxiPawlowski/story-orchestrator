import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanMessageText, cleanWindowMessage, HYGIENE_VERSION } from "./windowHygiene";

const reply = (mes: string, extra: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) => ({ name: "Mara", is_user: false, is_system: false, send_date: "2026-09-24", mes, extra, ...rest });

const sdPost = (visible: boolean) => ({
  name: "SillyTavern System",
  is_user: false,
  is_system: !visible,
  send_date: "2026-09-24",
  mes: "a lantern-lit ruin at dusk, the door ajar",
  extra: {
    media: [{ url: "/user/images/sd.png", type: "image", title: "a lantern-lit ruin at dusk", generation_type: 6, negative: "", source: "generated" }],
    media_display: "gallery",
    media_index: 0,
    inline_image: false,
  },
});

const buttonImageReply = () => reply("Mara lifts the lamp and the door swings open.", {
  media: [{ url: "/user/images/sd.png", type: "image", source: "generated", generation_type: 6, title: "Mara lifts the lamp" }],
  media_display: "gallery",
  media_index: 0,
  inline_image: true,
});

const thoughtPost = (mes: string) => ({
  name: "Mara",
  is_user: false,
  is_system: false,
  is_thoughts: true,
  is_thoughts_empty: true,
  thoughts_for: "Mara",
  send_date: "2026-09-24",
  mes,
  extra: { type: undefined, bias: null, gen_id: 1, isSmallSys: false, api: "script", model: "stepped thinking" },
  owner_extension: "st-stepped-thinking",
});

const defaultThoughtTemplate = "<details type=\"executing\" ><summary>Thinking (Mara) 💭</summary>\n```md\nShe wonders whether the key is a trap.\n```\n</details>";

const cyoaPost = () => ({
  name: "CYOA Suggestions",
  is_user: true,
  is_system: false,
  send_date: "2026-09-24",
  mes: "<div class=\"cyoa\"><button class=\"menu_button\">1. I grab the Sun Idol</button><button class=\"menu_button\">2. I run for the gate</button></div>",
  mesId: 7,
  extra: { api: "manual", model: "cyoa" },
});

const kept = (raw: unknown) => {
  const result = cleanWindowMessage(raw);
  if (!result.keep) throw new Error(`dropped: ${result.reason}`);
  return result;
};

const dropReason = (raw: unknown) => {
  const result = cleanWindowMessage(raw);
  return result.keep ? null : result.reason;
};

describe("v2.4 plan 04 T7: one cleaner for every window reader", () => {
  it("states its form", () => {
    expect(HYGIENE_VERSION).toBeGreaterThanOrEqual(1);
  });

  describe("message rules, shape first", () => {
    it("keeps dropping hidden and in-flight messages", () => {
      expect(dropReason(reply("hidden", {}, { is_system: true }))).toBe("hidden");
      expect(dropReason(reply("half a reply", {}, { gen_started: "t0" }))).toBe("in flight");
      expect(kept(reply("a whole reply", {}, { gen_started: "t0", gen_finished: "t1" })).text).toBe("a whole reply");
    });

    it("drops an ST system type other than narrator, and keeps /sys narration (host facts 04-H4, 04-H5)", () => {
      expect(dropReason({ name: "Note", is_user: false, is_system: false, mes: "Checkpoint reached: the gate.", extra: { type: "comment" } })).toBe("system type");
      expect(dropReason({ name: "Note", is_user: false, is_system: true, mes: "Checkpoint reached: the gate.", extra: { type: "comment", isSmallSys: true, api: "manual", model: "slash command" } })).toBe("hidden");
      expect(dropReason({ name: "SillyTavern System", is_user: false, is_system: false, mes: "Welcome", extra: { type: "welcome" } })).toBe("system type");
      const narration = kept({ name: "System", is_user: false, is_system: false, mes: "The bells of the ruin ring out.", extra: { type: "narrator", bias: null, gen_id: 1, isSmallSys: false, api: "manual", model: "slash command" } });
      expect(narration).toEqual({ keep: true, text: "The bells of the ruin ring out.", isUser: false, speaker: "System" });
    });

    it("treats an unknown extra.type as an ordinary message", () => {
      expect(kept(reply("Mara nods.", { type: "some-extension" })).text).toBe("Mara nods.");
    });

    it("drops a visible /sd post but keeps a reply that gained an image through the per-message button (04-H6, 04-H7)", () => {
      expect(dropReason(sdPost(true))).toBe("image post");
      expect(dropReason(sdPost(false))).toBe("hidden");
      expect(kept(buttonImageReply()).text).toBe("Mara lifts the lamp and the door swings open.");
      expect(kept(reply("Mara waves.", { media: [{ source: "upload", type: "image" }], inline_image: false })).text).toBe("Mara waves.");
      expect(kept(reply("Mara waves.", { media: [{ source: "generated", type: "image" }], inline_image: false })).text).toBe("Mara waves.");
      expect(kept({ ...sdPost(true), is_user: true }).isUser).toBe(true);
    });

    it("drops a Stepped Thinking 3.2.0 thought post, default template or customised (04-H8)", () => {
      expect(dropReason(thoughtPost(defaultThoughtTemplate))).toBe("empty");
      expect(dropReason(thoughtPost("Mara thinks the key is a trap."))).toBe("thoughts");
      expect(kept({ ...thoughtPost("Mara thinks the key is a trap."), owner_extension: "another-extension" }).text).toBe("Mara thinks the key is a trap.");
    });

    it("drops a CYOA suggestion post, whose button labels would read as the player's own actions (04-H9)", () => {
      expect(dropReason(cyoaPost())).toBe("suggestions");
      expect(kept({ ...cyoaPost(), extra: { api: "manual", model: "other" } }).isUser).toBe(true);
    });

    it("drops a message with nothing left after cleaning", () => {
      expect(dropReason(reply("<div style=\"display:none\">hp: 10</div>"))).toBe("empty");
      expect(dropReason(reply("   "))).toBe("empty");
      expect(dropReason(reply("", {}, { mes: 42 }))).toBe("empty");
    });

    it("reads the speaker and whether the player wrote it", () => {
      expect(kept({ name: "Max", is_user: true, mes: "I grab the Sun Idol." })).toEqual({ keep: true, text: "I grab the Sun Idol.", isUser: true, speaker: "Max" });
      expect(kept({ is_user: true, mes: "Hello" }).speaker).toBe("User");
      expect(kept({ is_user: false, mes: "Hello" }).speaker).toBe("Assistant");
      expect(dropReason(null)).toBe("not a message");
    });
  });

  describe("text rules", () => {
    it("strips leading reasoning with the extraction parser's own forms", () => {
      expect(cleanMessageText("<think>plan the reply</think>Mara opens the door.")).toBe("Mara opens the door.");
      expect(cleanMessageText("<think>never closed")).toBe("");
    });

    it("drops <details>, open or closed, and script, style and template", () => {
      expect(cleanMessageText("Mara nods.<details><summary>Status</summary>trust: 5</details>")).toBe("Mara nods.");
      expect(cleanMessageText("Mara nods.<details open><summary>Status</summary>trust: 5</details> Then she leaves.")).toBe("Mara nods.\nThen she leaves.");
      expect(cleanMessageText("A<script>window.x = 1</script>B<style>.a{}</style>C<template><p>t</p></template>D")).toBe("A\nB\nC\nD");
    });

    it("drops an element whose inline style hides it, nested content and all", () => {
      expect(cleanMessageText("Mara hands you the key.<div style=\"color: red; display: none\"><div>door_open: true</div><span>trust: 5</span></div>")).toBe("Mara hands you the key.");
      expect(cleanMessageText("<span style='display:none'>x</span>Seen.")).toBe("Seen.");
      expect(cleanMessageText("<div style=\"display: block\">Seen.</div>")).toBe("Seen.");
    });

    it("drops a tagged fence and unwraps an untagged one", () => {
      expect(cleanMessageText("Mara smiles.\n```sim\n{\"trust\": 5}\n```\nShe waits.")).toBe("Mara smiles.\nShe waits.");
      expect(cleanMessageText("The sign reads:\n```\nKEEP OUT\n```")).toBe("The sign reads:\nKEEP OUT");
      expect(cleanMessageText("Mara smiles.\n~~~json\n{\"a\": 1}\n~~~")).toBe("Mara smiles.");
    });

    it("removes the remaining tags but keeps their text, and decodes entities once", () => {
      expect(cleanMessageText("<i>Mara</i> whispers, <b>&quot;run&quot;</b> &amp; you run.")).toBe("Mara whispers, \"run\" & you run.");
      expect(cleanMessageText("It&#39;s &lt;b&gt;fine&lt;/b&gt;&nbsp;now &#x263A; &amp;lt;")).toBe("It's <b>fine</b> now ☺ &lt;");
      expect(cleanMessageText("line one<br>line two<p>para</p>")).toBe("line one\nline two\npara");
    });

    it("leaves Markdown emphasis alone, because it is narration", () => {
      expect(cleanMessageText("*Mara steps back.* \"Not yet.\"")).toBe("*Mara steps back.* \"Not yet.\"");
    });

    it("collapses whitespace but keeps paragraphs", () => {
      expect(cleanMessageText("  Mara   waits.\t\r\n\r\n\r\n\r\nThen  she speaks.  ")).toBe("Mara waits.\n\nThen she speaks.");
    });

    it("survives a hostile corpus", () => {
      expect(cleanMessageText("<details open><details><summary>a</summary>inner</details>outer</details>After.")).toBe("After.");
      expect(cleanMessageText("Before.<details><summary>never closed")).toBe("Before.");
      expect(cleanMessageText("Mara <i>pauses")).toBe("Mara pauses");
      expect(cleanMessageText("a < b and c > d")).toBe("a < b and c > d");
      expect(cleanMessageText("&amp;amp; &bogus; &#0; &#99999999;")).toBe("&amp; &bogus; &#0; &#99999999;");
      expect(cleanMessageText("```sim\n{\"never\": \"closed\"}")).toBe("");
      expect(cleanMessageText("<!-- tracker: hp 10 -->Mara bows.")).toBe("Mara bows.");
      expect(cleanMessageText("She reads the <i>old letter</i> aloud: <q>Come home.</q>")).toBe("She reads the old letter aloud: Come home.");
    });

    it("drops story text an author put inside <details>, which the fixture pins (plan §Risks)", () => {
      expect(cleanMessageText("The letter says:<details><summary>Letter</summary>Meet me at the mill.</details>")).toBe("The letter says:");
    });
  });

  describe("identity on the extraction corpus", () => {
    const fixturesDir = join(process.cwd(), "test/fixtures");
    const transcripts = readdirSync(fixturesDir).filter((file) => /^extractor\d*\.transcript\.json$/.test(file));

    it("reads the whole corpus", () => {
      expect(transcripts.length).toBe(22);
    });

    it.each(transcripts)("leaves %s unchanged", (file) => {
      const entries = JSON.parse(readFileSync(join(fixturesDir, file), "utf8")) as Array<{ text: string }>;
      entries.forEach((entry) => expect(cleanMessageText(entry.text)).toBe(entry.text));
    });
  });

  it("is cheap enough for the reply path: 24 messages of 8 KB well under 5 ms", () => {
    const block = `Mara <i>walks</i> on. <details><summary>s</summary>${"x".repeat(200)}</details> &amp; *smiles*\n`;
    const message = block.repeat(Math.ceil(8192 / block.length)).slice(0, 8192);
    const window = Array.from({ length: 24 }, (_, index) => reply(`${message}${index}`));
    window.forEach((entry) => cleanWindowMessage(entry));
    const runs = Array.from({ length: 5 }, () => {
      const started = performance.now();
      window.forEach((entry) => cleanWindowMessage(entry));
      return performance.now() - started;
    });
    expect(Math.min(...runs)).toBeLessThan(5);
  });
});
