import test from "node:test";
import assert from "node:assert/strict";
import { EmoteCatalog, emoteMap, parseMessageContent } from "../emotes.mjs";

const set = (name = "Alias") => ({
  emotes: [
    {
      id: "abc",
      name,
      data: {
        host: {
          url: "//cdn.7tv.app/emote/abc",
          files: [{ name: "2x.webp", width: 64, height: 32 }],
        },
      },
    },
  ],
});
const images = (result) =>
  result.content.filter((part) => part.type === "emote");

test("Twitch repeated emotes and inclusive ranges", () => {
  const result = parseMessageContent("Kappa hi Kappa", "25:0-4,9-13");
  assert.equal(images(result).length, 2);
  assert.equal(result.content[1].text, " hi ");
  assert.equal(images(result)[0].code, "Kappa");
});
test("Unicode and ACTION offsets", () => {
  assert.equal(
    images(parseMessageContent("😀 Kappa", "25:2-6"))[0].code,
    "Kappa",
  );
  const result = parseMessageContent("\u0001ACTION Kappa\u0001", "25:0-4");
  assert.equal(result.text, "Kappa");
  assert.equal(images(result).length, 1);
});
test("invalid and overlapping ranges are ignored", () => {
  const result = parseMessageContent("Kappa", "25:0-4,0-4,4-2,0-99,nope");
  assert.equal(images(result).length, 1);
});
test("truncation does not split Unicode or recognized emotes", () => {
  assert.equal(
    Array.from(parseMessageContent("😀".repeat(221)).text).length,
    220,
  );
  const result = parseMessageContent("x".repeat(218) + " Kappa", "25:219-223");
  assert.equal(result.text.length, 219);
  assert.equal(images(result).length, 0);
});
test("7TV aliases, exact case and whitespace matching", () => {
  const channel = emoteMap(set());
  assert.equal(
    images(
      parseMessageContent("Alias\tAlias alias xAlias Alias!", "", { channel }),
    ).length,
    2,
  );
  assert.equal(channel.get("Alias").width, 64);
});
test("Twitch beats 7TV and channel beats global", () => {
  const channel = emoteMap(set("Kappa"));
  const global = new Map([
    ["Kappa", { ...channel.get("Kappa"), id: "global" }],
  ]);
  assert.equal(
    images(parseMessageContent("Kappa", "25:0-4", { channel, global }))[0]
      .provider,
    "twitch",
  );
  assert.equal(
    images(parseMessageContent("Kappa", "", { channel, global }))[0].id,
    "abc",
  );
});
test("cache loads once and retains successful catalog after failure", async () => {
  let calls = 0;
  let now = 0;
  let fail = false;
  const catalog = new EmoteCatalog(
    async () => {
      calls++;
      if (fail) throw new Error("offline");
      return { ok: true, json: async () => set() };
    },
    () => now,
  );
  catalog.get();
  await catalog.global.pending;
  assert.equal(catalog.get().global.size, 1);
  assert.equal(calls, 1);
  now = 300001;
  fail = true;
  catalog.get();
  await catalog.global.pending;
  assert.equal(catalog.get().global.size, 1);
});
test("channel 404 is safe and missing catalog leaves plain text", async () => {
  const catalog = new EmoteCatalog(
    async () => ({ status: 404 }),
    () => 1,
  );
  catalog.get("123");
  await catalog.channels.get("123").pending;
  assert.equal(catalog.get("123").channel.size, 0);
  assert.deepEqual(parseMessageContent("Alias").content, [
    { type: "text", text: "Alias" },
  ]);
});
