import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for WebSocket state");
}

test(
  "server sends identical emote content, isolates profiles and restores snapshots",
  { timeout: 15000 },
  async (t) => {
    const upstream = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await once(upstream, "listening");
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const clients = [];
    const child = spawn(process.execPath, ["scripts/sync-server.mjs"], {
      env: {
        ...process.env,
        CHAT_STICKERS_SYNC_PORT: String(port),
        CHAT_STICKERS_TWITCH_URL: `ws://127.0.0.1:${upstream.address().port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(async () => {
      for (const client of clients) client.terminate();
      const exited = once(child, "exit");
      child.kill("SIGINT");
      await exited;
      for (const client of upstream.clients) client.terminate();
      await new Promise((resolve) => upstream.close(resolve));
    });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    await waitUntil(() => output.includes("Chat Stickers sync:"));
    let twitch;
    upstream.on("connection", (client) => {
      twitch = client;
    });
    const profile = (id, rewardMode) => ({
      id,
      name: id,
      updatedAt: 1,
      settings: {
        channel: "fixture",
        lifetime: 30,
        rewardMode,
        safeTop: 8,
        safeRight: 8,
        safeBottom: 8,
        safeLeft: 8,
        safeAreaExcluded: false,
      },
    });
    async function connect(id, rewardMode) {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      clients.push(client);
      client.states = [];
      client.on("message", (raw) => {
        const message = JSON.parse(raw);
        if (message.type === "stickers") client.states.push(message);
      });
      await once(client, "open");
      client.send(
        JSON.stringify({
          type: "hello",
          role: "overlay",
          profile: profile(id, rewardMode),
        }),
      );
      await waitUntil(() => client.states.length > 0);
      return client;
    }
    const a = await connect("chat", false);
    const b = await connect("chat", false);
    const rewards = await connect("rewards", true);
    await waitUntil(() => twitch);
    twitch.send(
      "@emotes=25:2-6;id=message-one :viewer!viewer@viewer PRIVMSG #fixture :😀 Kappa\r\n",
    );
    await waitUntil(
      () =>
        a.states.at(-1).stickers.length === 1 &&
        b.states.at(-1).stickers.length === 1,
    );
    assert.deepEqual(
      a.states.at(-1).stickers[0].content,
      b.states.at(-1).stickers[0].content,
    );
    assert.equal(a.states.at(-1).stickers[0].content[1].provider, "twitch");
    assert.equal(rewards.states.at(-1).stickers.length, 0);
    const restored = await connect("chat", false);
    assert.deepEqual(
      restored.states.at(-1).stickers[0].content,
      a.states.at(-1).stickers[0].content,
    );
  },
);
