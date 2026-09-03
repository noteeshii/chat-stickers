import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

const host = "127.0.0.1";
const port = Number(process.env.CHAT_STICKERS_SYNC_PORT) || 17891;
const maximumVisibleStickers = 10;
const stickerGap = 2;
const temporaryRewardId = "8581cf28-1f69-4c05-9795-a7700b19c088";
const pinnedRewardId = "aced2e10-3cf0-4b7d-9774-6ede44271d5b";
const pinnedRewardLifetime = 10 * 60 * 1000;
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
const profiles = new Map();
const twitchConnections = new Map();
let isShuttingDown = false;

function send(client, message) {
  if (client.readyState === WebSocket.OPEN)
    client.send(JSON.stringify(message));
}

function broadcast(message, predicate = () => true) {
  for (const client of server.clients) {
    if (predicate(client)) send(client, message);
  }
}

function profileSummary(profile) {
  return {
    id: profile.id,
    name: profile.name,
    updatedAt: profile.updatedAt,
    settings: profile.settings,
    clientCount: [...server.clients].filter(
      (client) => client.profileId === profile.id,
    ).length,
  };
}

function broadcastProfileList() {
  broadcast(
    {
      type: "profile-list",
      profiles: [...profiles.values()].map(profileSummary),
    },
    (client) => client.role === "controller",
  );
}

function broadcastToProfile(profile, message) {
  broadcast(message, (client) => client.profileId === profile.id);
}

function broadcastProfile(profile) {
  broadcastToProfile(profile, {
    type: "profile",
    profile: profileSummary(profile),
  });
}

function broadcastStickers(profile) {
  broadcastToProfile(profile, {
    type: "stickers",
    profileId: profile.id,
    stickers: profile.stickers,
    queueSize: profile.queue.length,
  });
}

function sendProfileSnapshot(client, profile) {
  send(client, { type: "profile", profile: profileSummary(profile) });
  send(client, {
    type: "chat-status",
    profileId: profile.id,
    status: getChatStatus(profile.settings.channel),
  });
  send(client, {
    type: "stickers",
    profileId: profile.id,
    stickers: profile.stickers,
    queueSize: profile.queue.length,
  });
}

function clampSetting(value, fallback) {
  return Number.isFinite(value)
    ? Math.min(80, Math.max(0, Number(value)))
    : fallback;
}

function sanitizeSettings(value = {}, current = defaultSettings) {
  return {
    channel:
      typeof value.channel === "string"
        ? value.channel.trim().toLowerCase().replace(/^[@#]/, "")
        : current.channel,
    lifetime: Number.isFinite(value.lifetime)
      ? Math.max(2, Number(value.lifetime))
      : current.lifetime,
    rewardMode:
      typeof value.rewardMode === "boolean"
        ? value.rewardMode
        : current.rewardMode,
    safeTop: clampSetting(value.safeTop, current.safeTop),
    safeRight: clampSetting(value.safeRight, current.safeRight),
    safeBottom: clampSetting(value.safeBottom, current.safeBottom),
    safeLeft: clampSetting(value.safeLeft, current.safeLeft),
    safeAreaExcluded:
      typeof value.safeAreaExcluded === "boolean"
        ? value.safeAreaExcluded
        : current.safeAreaExcluded,
  };
}

function createProfile(payload) {
  const profile = {
    id: payload.id,
    name: payload.name?.trim() || "Новый профиль",
    updatedAt: Number(payload.updatedAt) || Date.now(),
    settings: sanitizeSettings(payload.settings),
    stickers: [],
    queue: [],
    nextId: 1,
    nextDemo: 0,
  };
  profiles.set(profile.id, profile);
  broadcastProfileList();
  return profile;
}

function upsertProfile(payload) {
  if (!payload?.id) return null;
  const existing = profiles.get(payload.id);
  if (!existing) return createProfile(payload);

  const incomingUpdatedAt = Number(payload.updatedAt) || 0;
  if (incomingUpdatedAt <= existing.updatedAt) return existing;

  const oldSettings = existing.settings;
  existing.name = payload.name?.trim() || existing.name;
  existing.updatedAt = incomingUpdatedAt || Date.now();
  existing.settings = sanitizeSettings(payload.settings, existing.settings);

  if (oldSettings.safeAreaExcluded !== existing.settings.safeAreaExcluded) {
    existing.stickers = [];
    existing.queue = [];
    broadcastStickers(existing);
  }

  broadcastProfile(existing);
  broadcastProfileList();
  return existing;
}

function getRandomEffect() {
  const roll = Math.random();
  let total = 0;
  for (const [effect, chance] of [
    ["polychrome", 0.01],
    ["holographic", 0.03],
    ["gold", 0.05],
    ["foil", 0.07],
  ]) {
    total += chance;
    if (roll < total) return effect;
  }
  return "none";
}

function getStickerFootprint(profile) {
  const settings = profile.settings;
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

function positionIsAllowed(profile, x, y) {
  const settings = profile.settings;
  if (!settings.safeAreaExcluded) return true;
  return (
    x < settings.safeLeft ||
    x > 100 - settings.safeRight ||
    y < settings.safeTop ||
    y > 100 - settings.safeBottom
  );
}

function positionOverlaps(profile, x, y, footprint) {
  return profile.stickers.some((sticker) => {
    if (sticker.leaving) return false;
    return !(
      x + footprint.width + stickerGap <= sticker.x ||
      x >= sticker.x + footprint.width + stickerGap ||
      y + footprint.height + stickerGap <= sticker.y ||
      y >= sticker.y + footprint.height + stickerGap
    );
  });
}

function findAvailablePosition(profile) {
  const footprint = getStickerFootprint(profile);
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
      positionIsAllowed(profile, x, y) &&
      !positionOverlaps(profile, x, y, footprint),
  );
}

function addSticker(profile, author, text, roles = [], sourceId, options = {}) {
  const queuedSticker = {
    syncId: `${profile.id}:${sourceId || randomUUID()}`,
    author,
    text: text.slice(0, 220),
    roles,
    effect: getRandomEffect(),
    pinned: options.pinned === true,
    customRewardId: options.customRewardId || null,
    lifetimeMs: options.lifetimeMs ?? profile.settings.lifetime * 1000,
    forceExpiry: options.forceExpiry === true,
  };

  if (
    profile.stickers.length >= maximumVisibleStickers ||
    !showSticker(profile, queuedSticker)
  ) {
    profile.queue.push(queuedSticker);
    broadcastStickers(profile);
  }
}

function showSticker(profile, queuedSticker) {
  const position = findAvailablePosition(profile);
  if (!position) return false;
  const id = profile.nextId++;
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
    pinned: queuedSticker.pinned,
    effect: queuedSticker.effect,
    roles: queuedSticker.roles,
    customRewardId: queuedSticker.customRewardId,
  };
  profile.stickers.push(sticker);
  broadcastStickers(profile);

  setTimeout(() => {
    const current = findSticker(profile, sticker.syncId);
    if (current && (queuedSticker.forceExpiry || !current.pinned)) {
      beginLeaving(profile, sticker.syncId);
    }
  }, queuedSticker.lifetimeMs);
  return true;
}

function findSticker(profile, syncId) {
  return profile.stickers.find((sticker) => sticker.syncId === syncId);
}

function beginLeaving(profile, syncId) {
  const sticker = findSticker(profile, syncId);
  if (!sticker || sticker.leaving) return;
  sticker.leaving = true;
  broadcastStickers(profile);
  setTimeout(() => removeSticker(profile, syncId), 900);
}

function removeSticker(profile, syncId) {
  if (!findSticker(profile, syncId)) return;
  profile.stickers = profile.stickers.filter((item) => item.syncId !== syncId);
  releaseQueue(profile);
  broadcastStickers(profile);
}

function releaseQueue(profile) {
  while (
    profile.stickers.length < maximumVisibleStickers &&
    profile.queue.length
  ) {
    const nextSticker = profile.queue.shift();
    if (!showSticker(profile, nextSticker)) {
      profile.queue.unshift(nextSticker);
      break;
    }
  }
}

function applyStickerAction(profile, message) {
  const sticker = findSticker(profile, message.stickerId);
  if (!sticker) return;
  if (message.action === "pin") {
    if (message.pinned) {
      sticker.pinned = true;
      sticker.leaving = false;
      broadcastStickers(profile);
    } else {
      sticker.pinned = false;
      beginLeaving(profile, sticker.syncId);
    }
  } else if (message.action === "move") {
    const x = Number(message.x);
    const y = Number(message.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    sticker.x = x;
    sticker.y = y;
    broadcastStickers(profile);
  } else if (message.action === "remove") {
    removeSticker(profile, sticker.syncId);
  }
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

function parseTwitchLine(channel, line) {
  const connection = twitchConnections.get(channel);
  if (line.startsWith("PING")) {
    connection?.socket?.send("PONG :tmi.twitch.tv");
    return;
  }
  const match = line.match(
    /^(?:@([^ ]+) )?:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.+)$/,
  );
  if (!match) return;

  const tags = parseTags(match[1]);
  const customRewardId = tags["custom-reward-id"];
  const badges = (tags.badges || "")
    .split(",")
    .map((badge) => badge.split("/")[0]);

  for (const profile of profiles.values()) {
    if (profile.settings.channel !== channel) continue;
    if (
      profile.settings.rewardMode &&
      customRewardId !== temporaryRewardId &&
      customRewardId !== pinnedRewardId
    ) {
      continue;
    }
    if (!profile.settings.rewardMode && customRewardId) {
      continue;
    }

    const roles = [];
    const isOwner = match[2].toLowerCase() === channel;
    if (isOwner) roles.push("channelOwner");
    if (badges.includes("moderator") || tags.mod === "1")
      roles.push("moderator");
    if (badges.includes("vip")) roles.push("vip");
    if (
      !isOwner &&
      (badges.includes("subscriber") || tags.subscriber === "1")
    ) {
      roles.push("subscriber");
    }

    const options =
      profile.settings.rewardMode && customRewardId === pinnedRewardId
        ? {
            pinned: true,
            customRewardId,
            lifetimeMs: pinnedRewardLifetime,
            forceExpiry: true,
          }
        : {
            customRewardId: profile.settings.rewardMode ? customRewardId : null,
          };

    if (profile.settings.rewardMode && customRewardId === pinnedRewardId) {
      profile.stickers = profile.stickers.filter(
        (sticker) => sticker.customRewardId !== pinnedRewardId,
      );
      profile.queue = profile.queue.filter(
        (sticker) => sticker.customRewardId !== pinnedRewardId,
      );
    }
    addSticker(
      profile,
      tags["display-name"] || match[2],
      match[3],
      roles,
      tags.id,
      options,
    );
  }
}

function getChatStatus(channel) {
  if (!channel) return "idle";
  return twitchConnections.get(channel)?.status || "idle";
}

function broadcastChatStatus(channel, status) {
  for (const profile of profiles.values()) {
    if (profile.settings.channel === channel) {
      broadcastToProfile(profile, {
        type: "chat-status",
        profileId: profile.id,
        status,
      });
    }
  }
}

function connectToTwitch(channel) {
  const cleanChannel = channel.trim().toLowerCase().replace(/^[@#]/, "");
  if (!cleanChannel) return;
  const existing = twitchConnections.get(cleanChannel);
  if (existing?.status === "connected" || existing?.status === "connecting")
    return;

  if (existing?.reconnectTimer) clearTimeout(existing.reconnectTimer);
  const state = existing || {
    socket: null,
    status: "idle",
    reconnectTimer: null,
  };
  state.status = "connecting";
  twitchConnections.set(cleanChannel, state);
  broadcastChatStatus(cleanChannel, "connecting");

  const socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
  state.socket = socket;
  socket.on("open", () => {
    if (state.socket !== socket) return;
    const nick = `justinfan${Math.floor(10000 + Math.random() * 80000)}`;
    socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    socket.send("PASS SCHMOOPIIE");
    socket.send(`NICK ${nick}`);
    socket.send(`JOIN #${cleanChannel}`);
    state.status = "connected";
    broadcastChatStatus(cleanChannel, "connected");
  });
  socket.on("message", (data) => {
    String(data)
      .split("\r\n")
      .forEach((line) => parseTwitchLine(cleanChannel, line));
  });
  socket.on("close", () => {
    if (state.socket !== socket || isShuttingDown) return;
    state.socket = null;
    state.status = "error";
    broadcastChatStatus(cleanChannel, "error");
    state.reconnectTimer = setTimeout(
      () => connectToTwitch(cleanChannel),
      3000,
    );
  });
  socket.on("error", () => {
    if (state.socket === socket) {
      state.status = "error";
      broadcastChatStatus(cleanChannel, "error");
    }
  });
}

server.on("connection", (client) => {
  client.role = "unknown";
  client.profileId = null;

  client.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      if (message.type === "hello") {
        client.role = message.role;
        const profile = upsertProfile(message.profile);
        if (profile) {
          client.profileId = profile.id;
          sendProfileSnapshot(client, profile);
          if (message.role === "overlay" && profile.settings.channel) {
            connectToTwitch(profile.settings.channel);
          }
          broadcastProfileList();
        }
      } else if (message.type === "select-profile") {
        const profile = profiles.get(message.profileId);
        if (profile) {
          client.profileId = profile.id;
          sendProfileSnapshot(client, profile);
          broadcastProfileList();
        }
      } else if (message.type === "profile-update") {
        const profile = upsertProfile(message.profile);
        if (profile) {
          client.profileId = profile.id;
          sendProfileSnapshot(client, profile);
        }
      } else if (message.type === "connect-chat") {
        const profile = upsertProfile(message.profile);
        if (profile) connectToTwitch(profile.settings.channel);
      } else if (message.type === "sticker-action") {
        const profile = profiles.get(message.profileId || client.profileId);
        if (profile && message.stickerId) applyStickerAction(profile, message);
      } else if (message.type === "demo") {
        const profile = profiles.get(message.profileId || client.profileId);
        if (profile) {
          const demo = demoMessages[profile.nextDemo % demoMessages.length];
          profile.nextDemo += 1;
          addSticker(profile, demo[0], demo[1], demo[2]);
        }
      }
    } catch {
      send(client, { type: "error", message: "Некорректное сообщение" });
    }
  });
  client.on("close", broadcastProfileList);
});

server.on("listening", () => {
  console.log(`Chat Stickers sync: ws://${host}:${port}`);
  console.log("Профили создаются автоматически при подключении OBS.");
  console.log("Для остановки нажмите Ctrl+C.");
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
  for (const state of twitchConnections.values()) {
    clearTimeout(state.reconnectTimer);
    state.socket?.removeAllListeners();
    state.socket?.terminate();
  }
  for (const client of server.clients) client.terminate();
  server.close(() => {
    console.log("Сервер остановлен.");
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
