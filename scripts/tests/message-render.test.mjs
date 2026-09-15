import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parse, compileScript } from "@vue/compiler-sfc";
import ts from "typescript";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";

const source = await readFile(
  new URL("../../src/components/MessageContent.vue", import.meta.url),
  "utf8",
);
const { descriptor } = parse(source);
const compiled = compileScript(descriptor, {
  id: "message-test",
  inlineTemplate: true,
});
const code = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
new Function("require", "exports", "module", code)(
  createRequire(import.meta.url),
  module.exports,
  module,
);
const component = module.exports.default;

test("message renderer preserves mentions, images, sizing and escaped text", async () => {
  const html = await renderToString(
    createSSRApp(component, {
      channel: "cherry_in_wine",
      text: "unused",
      content: [
        { type: "text", text: "<script> @cherry_in_wine " },
        {
          type: "emote",
          provider: "7tv",
          id: "1",
          code: "Dance",
          url: "https://cdn.7tv.app/animated.webp",
          width: 64,
          height: 32,
        },
      ],
    }),
  );
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /channel-mention/);
  assert.match(html, /alt="Dance"/);
  assert.match(html, /width:3em/);
  assert.match(html, /animated.webp/);
});
test("legacy stickers still render plain message text", async () => {
  const html = await renderToString(
    createSSRApp(component, { channel: "", text: "Hello Kappa" }),
  );
  assert.match(html, /Hello Kappa/);
  assert.doesNotMatch(html, /<img/);
});
