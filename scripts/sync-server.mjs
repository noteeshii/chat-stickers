import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

const host = "127.0.0.1";
const port = 17891;
const maximumVisibleStickers = 10;
const stickerGap = 2;
const colors = [
  "#ffd84d",
  "#ff8fb8",
  "#8de5cf",
  "#a9c8ff",
  "#c8a8ff",
  "#ffab76",
];
const demoMessages = [
  ["pixel_fox", "Это выглядит потрясающе!", ["moderator"]],
  ["mooncat", "Ещё один раунд? 👀", ["vip"]],
  ["quiet_wizard", "GG! Вот это концовка", ["subscriber"]],
];
const effectChances = [
  ["polychrome", 0.01],
  ["holographic", 0.03],
  ["gold", 0.05],
  ["foil", 0.07],
];
const defaultSettings = {
  channel: "",
  lifetime: 12,
  rewardMode: false,
  safeTop: 8,
  safeRight: 8,
  safeBottom: 8,
  safeLeft: 8,
  safeAreaExcluded: false,
};

const server = new WebSocketServer({ host, port });
let settings = { ...defaultSettings };
let stickers = [];
let stickerQueue = [];
let nextId = 1;
let nextDemo = 0;
let twitchSocket = null;
let twitchReconnectTimer = null;
let requestedChannel = "";
let chatStatus = "idle";
let isShuttingDown = false;

function send(client, message) {
  if (client.readyState === WebSocket.OPEN)
    client.send(JSON.stringify(message));
}

function broadcast(message) {
  for (const client of server.clients) send(client, message);
}

function broadcastSettings() {
  broadcast({ type: "settings", settings });
}

function broadcastState() {
  broadcast({ type: "stickers", stickers, queueSize: stickerQueue.length });
}

function setChatStatus(status) {
  chatStatus = status;
  broadcast({ type: "chat-status", status });
}

function clampSetting(value, fallback) {
  return Number.isFinite(value)
    ? Math.min(80, Math.max(0, Number(value)))
    : fallback;
}

function sanitizeSettings(value = {}) {
  return {
    channel:
      typeof value.channel === "string"
        ? value.channel.trim().toLowerCase().replace(/^[@#]/, "")
        : settings.channel,
    lifetime: Number.isFinite(value.lifetime)
      ? Math.max(2, Number(value.lifetime))
      : settings.lifetime,
    rewardMode:
      typeof value.rewardMode === "boolean"
        ? value.rewardMode
        : settings.rewardMode,
    safeTop: clampSetting(value.safeTop, settings.safeTop),
    safeRight: clampSetting(value.safeRight, settings.safeRight),
    safeBottom: clampSetting(value.safeBottom, settings.safeBottom),
    safeLeft: clampSetting(value.safeLeft, settings.safeLeft),
    safeAreaExcluded:
      typeof value.safeAreaExcluded === "boolean"
        ? value.safeAreaExcluded
        : settings.safeAreaExcluded,
  };
}

function applySettings(value) {
  const previous = settings;
  settings = sanitizeSettings(value);

  if (previous.safeAreaExcluded !== settings.safeAreaExcluded) {
    stickers = [];
    stickerQueue = [];
    broadcastState();
  }

  if (previous.rewardMode !== settings.rewardMode) {
    stickerQueue = [];
    if (settings.rewardMode) {
      stickers = stickers.length ? [stickers.at(-1)] : [];
      if (stickers[0]) stickers[0].leaving = false;
    } else {
      for (const sticker of [...stickers]) {
        if (!sticker.pinned) beginLeaving(sticker.syncId);
      }
    }
    broadcastState();
  }

  broadcastSettings();
}

function getRandomEffect() {
  const roll = Math.random();
  let total = 0;
  for (const [effect, chance] of effectChances) {
    total += chance;
    if (roll < total) return effect;
  }
  return "none";
}

function getStickerFootprint() {
  const horizontalScale = settings.safeAreaExcluded
    ? 1
    : Math.max(0.2, (100 - settings.safeLeft - settings.safeRight) / 100);
  const verticalScale = settings.safeAreaExcluded
    ? 1
    : Math.max(0.2, (100 - settings.safeTop - settings.safeBottom) / 100);
  return {
    width: Math.min(96, 16 / horizontalScale),
    height: Math.min(96, 24 / verticalScale),
  };
}

function positionIsAllowed(x, y) {
  if (!settings.safeAreaExcluded) return true;
  return (
    x < settings.safeLeft ||
    x > 100 - settings.safeRight ||
    y < settings.safeTop ||
    y > 100 - settings.safeBottom
  );
}

function positionOverlapsSticker(x, y, footprint, ignoredSyncId) {
  return stickers.some((sticker) => {
    if (sticker.syncId === ignoredSyncId || sticker.leaving) return false;
    return !(
      x + footprint.width + stickerGap <= sticker.x ||
      x >= sticker.x + footprint.width + stickerGap ||
      y + footprint.height + stickerGap <= sticker.y ||
      y >= sticker.y + footprint.height + stickerGap
    );
  });
}

function findAvailablePosition() {
  const footprint = getStickerFootprint();
  const maximumX = Math.max(0, 100 - footprint.width);
  const maximumY = Math.max(0, 100 - footprint.height);
  const candidates = [];

  for (let attempt = 0; attempt < 80; attempt += 1) {
    candidates.push({
      x: Math.random() * maximumX,
      y: Math.random() * maximumY,
    });
  }
  for (let y = 0; y <= maximumY; y += footprint.height + stickerGap) {
    for (let x = 0; x <= maximumX; x += footprint.width + stickerGap) {
      candidates.push({ x, y });
    }
  }

  candidates.sort(() => Math.random() - 0.5);
  return candidates.find(
    ({ x, y }) =>
      positionIsAllowed(x, y) && !positionOverlapsSticker(x, y, footprint),
  );
}

function addSticker(author, text, roles = [], syncId = randomUUID()) {
  const queuedSticker = {
    syncId: syncId || randomUUID(),
    author,
    text: text.slice(0, 220),
    roles,
    effect: getRandomEffect(),
  };

  if (settings.rewardMode) {
    const currentSticker = stickers[0];
    if (!currentSticker) return void showSticker(queuedSticker);
    stickerQueue = [queuedSticker];
    beginLeaving(currentSticker.syncId);
    return;
  }

  if (
    stickers.length >= maximumVisibleStickers ||
    !showSticker(queuedSticker)
  ) {
    stickerQueue.push(queuedSticker);
    broadcastState();
  }
}

function showSticker(queuedSticker) {
  const position = findAvailablePosition();
  if (!position) return false;

  const id = nextId++;
  const sticker = {
    id,
    syncId: queuedSticker.syncId,
    author: queuedSticker.author,
    text: queuedSticker.text,
    color: colors[id % colors.length],
    x: position.x,
    y: position.y,
    rotation: -6 + Math.random() * 12,
    leaving: false,
    pinned: false,
    effect: queuedSticker.effect,
    roles: queuedSticker.roles,
  };
  stickers.push(sticker);
  broadcastState();

  if (!settings.rewardMode) {
    const delay = settings.lifetime * 1000;
    setTimeout(() => {
      const current = findSticker(sticker.syncId);
      if (current && !current.pinned && !settings.rewardMode) {
        current.leaving = true;
        broadcastState();
      }
    }, delay);
    setTimeout(() => {
      const current = findSticker(sticker.syncId);
      if (current && !current.pinned && !settings.rewardMode)
        removeSticker(sticker.syncId);
    }, delay + 900);
  }
  return true;
}

function findSticker(syncId) {
  return stickers.find((sticker) => sticker.syncId === syncId);
}

function beginLeaving(syncId) {
  const sticker = findSticker(syncId);
  if (!sticker || sticker.leaving) return;
  sticker.leaving = true;
  broadcastState();
  setTimeout(() => removeSticker(syncId), 900);
}

function removeSticker(syncId) {
  if (!findSticker(syncId)) return;
  stickers = stickers.filter((sticker) => sticker.syncId !== syncId);
  releaseQueuedStickers();
  broadcastState();
}

function releaseQueuedStickers() {
  const limit = settings.rewardMode ? 1 : maximumVisibleStickers;
  while (stickers.length < limit && stickerQueue.length) {
    const nextSticker = stickerQueue.shift();
    if (!showSticker(nextSticker)) {
      stickerQueue.unshift(nextSticker);
      break;
    }
  }
}

function applyStickerAction(message) {
  const sticker = findSticker(message.stickerId);
  if (!sticker) return;

  if (message.action === "pin") {
    if (message.pinned) {
      sticker.pinned = true;
      sticker.leaving = false;
      broadcastState();
    } else {
      sticker.pinned = false;
      beginLeaving(sticker.syncId);
    }
    return;
  }

  if (message.action === "move") {
    const x = Number(message.x);
    const y = Number(message.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    sticker.x = x;
    sticker.y = y;
    broadcastState();
    return;
  }

  if (message.action === "remove") removeSticker(sticker.syncId);
}

function parseTags(rawTags = "") {
  return Object.fromEntries(
    rawTags
      .split(";")
      .filter(Boolean)
      .map((tag) => {
        const separator = tag.indexOf("=");
        return separator < 0
          ? [tag, ""]
          : [tag.slice(0, separator), tag.slice(separator + 1)];
      }),
  );
}

function parseTwitchLine(line) {
  if (line.startsWith("PING")) {
    twitchSocket?.send("PONG :tmi.twitch.tv");
    return;
  }
  const match = line.match(
    /^(?:@([^ ]+) )?:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.+)$/,
  );
  if (!match) return;

  const tags = parseTags(match[1]);
  const isReward =
    Boolean(tags["custom-reward-id"]) ||
    ["highlighted-message", "skip-subs-mode-message"].includes(tags["msg-id"]);
  if (settings.rewardMode && !isReward) return;

  const badges = (tags.badges || "")
    .split(",")
    .map((badge) => badge.split("/")[0]);
  const roles = [];
  if (badges.includes("moderator") || tags.mod === "1") roles.push("moderator");
  if (badges.includes("vip")) roles.push("vip");
  if (badges.includes("subscriber") || tags.subscriber === "1")
    roles.push("subscriber");
  addSticker(tags["display-name"] || match[2], match[3], roles, tags.id);
}

function connectToTwitch(channel = settings.channel) {
  const cleanChannel = channel.trim().toLowerCase().replace(/^[@#]/, "");
  clearTimeout(twitchReconnectTimer);
  requestedChannel = cleanChannel;

  if (twitchSocket) {
    twitchSocket.removeAllListeners();
    twitchSocket.close();
    twitchSocket = null;
  }
  if (!cleanChannel) return void setChatStatus("idle");

  setChatStatus("connecting");
  const connection = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
  twitchSocket = connection;
  connection.on("open", () => {
    if (connection !== twitchSocket) return;
    const nick = `justinfan${Math.floor(10000 + Math.random() * 80000)}`;
    connection.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    connection.send("PASS SCHMOOPIIE");
    connection.send(`NICK ${nick}`);
    connection.send(`JOIN #${cleanChannel}`);
    setChatStatus("connected");
  });
  connection.on("message", (data) =>
    String(data).split("\r\n").forEach(parseTwitchLine),
  );
  connection.on("close", () => {
    if (connection !== twitchSocket) return;
    twitchSocket = null;
    setChatStatus("error");
    twitchReconnectTimer = setTimeout(() => {
      if (requestedChannel === cleanChannel) connectToTwitch(cleanChannel);
    }, 3000);
  });
  connection.on("error", () => {
    if (connection === twitchSocket) setChatStatus("error");
  });
}

function sendSnapshot(client) {
  send(client, { type: "settings", settings });
  send(client, { type: "chat-status", status: chatStatus });
  send(client, { type: "stickers", stickers, queueSize: stickerQueue.length });
}

server.on("connection", (client) => {
  client.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      if (message.type === "hello") {
        if (!settings.channel && message.settings) {
          applySettings(message.settings);
          if (message.role === "overlay" && settings.channel) connectToTwitch();
        }
        sendSnapshot(client);
      } else if (message.type === "settings" && message.settings) {
        applySettings(message.settings);
      } else if (message.type === "connect-chat" && message.settings) {
        applySettings(message.settings);
        connectToTwitch();
      } else if (message.type === "sticker-action" && message.stickerId) {
        applyStickerAction(message);
      } else if (message.type === "demo") {
        const [author, text, roles] =
          demoMessages[nextDemo % demoMessages.length];
        nextDemo += 1;
        addSticker(author, text, roles);
      }
    } catch {
      send(client, { type: "error", message: "Некорректное сообщение" });
    }
  });
});

server.on("listening", () => {
  console.log(`Chat Stickers sync: ws://${host}:${port}`);
  console.log("Twitch-чат подключается через этот процесс.");
  console.log("Оставьте это окно открытым во время трансляции.");
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Порт ${port} уже занят. Возможно, сервер уже запущен.`
      : error,
  );
  process.exitCode = 1;
});

function shutdown() {
  if (isShuttingDown) return;

  isShuttingDown = true;
  console.log("\nЗавершаем Chat Stickers sync…");
  clearTimeout(twitchReconnectTimer);
  requestedChannel = "";

  if (twitchSocket) {
    twitchSocket.removeAllListeners();
    twitchSocket.terminate();
    twitchSocket = null;
  }

  for (const client of server.clients) {
    client.terminate();
  }

  server.close(() => {
    console.log("Сервер остановлен.");
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
