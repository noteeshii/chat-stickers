import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { ConnectionStatus, Sticker } from "../types";

type SyncedSettings = {
  channel: string;
  lifetime: number;
  rewardMode: boolean;
  safeTop: number;
  safeRight: number;
  safeBottom: number;
  safeLeft: number;
  safeAreaExcluded: boolean;
};

type StickerSyncAction =
  | { action: "pin"; stickerId: string; pinned: boolean }
  | { action: "move"; stickerId: string; x: number; y: number }
  | { action: "remove"; stickerId: string };

export const useChatStickersStore = defineStore("chat-stickers", () => {
  const params = new URLSearchParams(location.search);
  const obsWindow = window as Window & { obsstudio?: unknown };
  const isRunningInObs =
    typeof obsWindow.obsstudio !== "undefined" ||
    navigator.userAgent.toLowerCase().includes("obs");
  const isOverlay = ref(params.get("overlay") === "1" || isRunningInObs);
  const channel = ref(
    (
      params.get("channel") ||
      localStorage.getItem("sticker-channel") ||
      ""
    ).replace(/^@/, ""),
  );
  const lifetime = ref(
    Number(
      params.get("lifetime") || localStorage.getItem("sticker-lifetime") || 12,
    ),
  );
  const rewardMode = ref(
    params.get("rewardMode") === "1" ||
      localStorage.getItem("sticker-reward-mode") === "true",
  );
  const legacySafeHorizontal = Number(
    params.get("safeX") || localStorage.getItem("sticker-safe-horizontal") || 8,
  );
  const legacySafeVertical = Number(
    params.get("safeY") || localStorage.getItem("sticker-safe-vertical") || 8,
  );
  const safeTop = ref(
    Number(
      params.get("safeTop") ||
        localStorage.getItem("sticker-safe-top") ||
        legacySafeVertical,
    ),
  );
  const safeRight = ref(
    Number(
      params.get("safeRight") ||
        localStorage.getItem("sticker-safe-right") ||
        legacySafeHorizontal,
    ),
  );
  const safeBottom = ref(
    Number(
      params.get("safeBottom") ||
        localStorage.getItem("sticker-safe-bottom") ||
        legacySafeVertical,
    ),
  );
  const safeLeft = ref(
    Number(
      params.get("safeLeft") ||
        localStorage.getItem("sticker-safe-left") ||
        legacySafeHorizontal,
    ),
  );
  const safeAreaExcluded = ref(
    params.get("safeMode") === "exclude" ||
      localStorage.getItem("sticker-safe-mode") === "exclude",
  );
  const status = ref<ConnectionStatus>("idle");
  const syncStatus = ref<"connecting" | "connected" | "disconnected">(
    "connecting",
  );
  const stickers = ref<Sticker[]>([]);
  const queuedStickerCount = ref(0);
  let syncSocket: WebSocket | null = null;
  let syncReconnectTimer = 0;
  let settingsBroadcastFrame = 0;
  let stickerMoveBroadcastFrame = 0;
  let syncIsDisposed = false;
  let applyingRemoteSettings = false;
  const pendingStickerMoves = new Map<string, { x: number; y: number }>();

  const statusText = computed(
    () =>
      ({
        idle: "Не подключено",
        connecting: "Подключаемся…",
        connected: "Чат в эфире",
        error: "Ошибка подключения",
      })[status.value],
  );
  const syncStatusText = computed(
    () =>
      ({
        connecting: "Синхронизация подключается…",
        connected: "Сервер управляет стикерами",
        disconnected: "Запустите npm run sync",
      })[syncStatus.value],
  );
  const overlayUrl = computed(() => {
    const pageUrl = location.href.split(/[?#]/)[0];
    const overlayParams = new URLSearchParams({
      overlay: "1",
      channel: channel.value.trim().toLowerCase(),
      lifetime: String(lifetime.value),
      rewardMode: rewardMode.value ? "1" : "0",
      safeTop: String(safeTop.value),
      safeRight: String(safeRight.value),
      safeBottom: String(safeBottom.value),
      safeLeft: String(safeLeft.value),
      safeMode: safeAreaExcluded.value ? "exclude" : "contain",
    });

    return `${pageUrl}?${overlayParams.toString()}`;
  });

  function getSyncedSettings(): SyncedSettings {
    return {
      channel: channel.value,
      lifetime: lifetime.value,
      rewardMode: rewardMode.value,
      safeTop: safeTop.value,
      safeRight: safeRight.value,
      safeBottom: safeBottom.value,
      safeLeft: safeLeft.value,
      safeAreaExcluded: safeAreaExcluded.value,
    };
  }

  function send(message: object) {
    if (syncSocket?.readyState === WebSocket.OPEN) {
      syncSocket.send(JSON.stringify(message));
    }
  }

  function sendSettings() {
    settingsBroadcastFrame = 0;
    send({ type: "settings", settings: getSyncedSettings() });
  }

  function queueSettingsBroadcast() {
    if (!applyingRemoteSettings && !settingsBroadcastFrame) {
      settingsBroadcastFrame = requestAnimationFrame(sendSettings);
    }
  }

  function applySyncedSettings(settings: Partial<SyncedSettings>) {
    applyingRemoteSettings = true;
    if (typeof settings.channel === "string") channel.value = settings.channel;
    if (typeof settings.lifetime === "number")
      lifetime.value = settings.lifetime;
    if (typeof settings.rewardMode === "boolean")
      rewardMode.value = settings.rewardMode;
    if (typeof settings.safeTop === "number") safeTop.value = settings.safeTop;
    if (typeof settings.safeRight === "number")
      safeRight.value = settings.safeRight;
    if (typeof settings.safeBottom === "number")
      safeBottom.value = settings.safeBottom;
    if (typeof settings.safeLeft === "number")
      safeLeft.value = settings.safeLeft;
    if (typeof settings.safeAreaExcluded === "boolean") {
      safeAreaExcluded.value = settings.safeAreaExcluded;
    }
    applyingRemoteSettings = false;
  }

  function connectSettingsSync() {
    clearTimeout(syncReconnectTimer);
    syncStatus.value = "connecting";
    syncSocket = new WebSocket("ws://127.0.0.1:17891");

    syncSocket.addEventListener("open", () => {
      syncStatus.value = "connected";
      send({
        type: "hello",
        role: isOverlay.value ? "overlay" : "controller",
        settings: getSyncedSettings(),
      });
      if (!isOverlay.value) sendSettings();
    });

    syncSocket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === "settings" && message.settings) {
          applySyncedSettings(message.settings);
        } else if (message.type === "chat-status" && message.status) {
          status.value = message.status;
        } else if (message.type === "stickers") {
          stickers.value = Array.isArray(message.stickers)
            ? message.stickers
            : [];
          queuedStickerCount.value = Number(message.queueSize) || 0;
        }
      } catch {
        // Игнорируем сообщения неизвестного формата.
      }
    });

    syncSocket.addEventListener("close", () => {
      syncStatus.value = "disconnected";
      status.value = "error";
      if (!syncIsDisposed) {
        syncReconnectTimer = window.setTimeout(connectSettingsSync, 2000);
      }
    });
    syncSocket.addEventListener("error", () => {
      syncStatus.value = "disconnected";
    });
  }

  function connect() {
    const cleanChannel = channel.value
      .trim()
      .toLowerCase()
      .replace(/^[@#]/, "");
    if (!cleanChannel) return;

    channel.value = cleanChannel;
    persistSettings();
    status.value = "connecting";
    send({ type: "connect-chat", settings: getSyncedSettings() });
  }

  function addDemoSticker() {
    send({ type: "demo" });
  }

  function sendStickerAction(action: StickerSyncAction) {
    send({ type: "sticker-action", ...action });
  }

  function toggleStickerPin(id: number) {
    const sticker = stickers.value.find((item) => item.id === id);
    if (!sticker) return;
    sendStickerAction({
      action: "pin",
      stickerId: sticker.syncId,
      pinned: !sticker.pinned,
    });
  }

  function flushStickerMoves() {
    stickerMoveBroadcastFrame = 0;
    pendingStickerMoves.forEach(({ x, y }, stickerId) => {
      sendStickerAction({ action: "move", stickerId, x, y });
    });
    pendingStickerMoves.clear();
  }

  function moveSticker(id: number, x: number, y: number) {
    const sticker = stickers.value.find((item) => item.id === id);
    if (!sticker) return;

    pendingStickerMoves.set(sticker.syncId, { x, y });
    if (!stickerMoveBroadcastFrame) {
      stickerMoveBroadcastFrame = requestAnimationFrame(flushStickerMoves);
    }
  }

  function removeSticker(id: number) {
    const sticker = stickers.value.find((item) => item.id === id);
    if (sticker) {
      sendStickerAction({ action: "remove", stickerId: sticker.syncId });
    }
  }

  function persistSettings() {
    localStorage.setItem("sticker-channel", channel.value);
    localStorage.setItem("sticker-lifetime", String(lifetime.value));
    localStorage.setItem("sticker-reward-mode", String(rewardMode.value));
    localStorage.setItem("sticker-safe-top", String(safeTop.value));
    localStorage.setItem("sticker-safe-right", String(safeRight.value));
    localStorage.setItem("sticker-safe-bottom", String(safeBottom.value));
    localStorage.setItem("sticker-safe-left", String(safeLeft.value));
    localStorage.setItem(
      "sticker-safe-mode",
      safeAreaExcluded.value ? "exclude" : "contain",
    );
  }

  function initialize() {
    syncIsDisposed = false;
    connectSettingsSync();
  }

  function dispose() {
    syncIsDisposed = true;
    clearTimeout(syncReconnectTimer);
    cancelAnimationFrame(settingsBroadcastFrame);
    cancelAnimationFrame(stickerMoveBroadcastFrame);
    syncSocket?.close();
    syncSocket = null;
  }

  async function copyOverlayUrl() {
    await navigator.clipboard.writeText(overlayUrl.value);
  }

  watch(
    [
      channel,
      lifetime,
      rewardMode,
      safeTop,
      safeRight,
      safeBottom,
      safeLeft,
      safeAreaExcluded,
    ],
    () => {
      persistSettings();
      queueSettingsBroadcast();
    },
    { flush: "sync" },
  );

  return {
    isOverlay,
    channel,
    lifetime,
    rewardMode,
    safeTop,
    safeRight,
    safeBottom,
    safeLeft,
    safeAreaExcluded,
    syncStatus,
    status,
    stickers,
    queuedStickerCount,
    statusText,
    syncStatusText,
    overlayUrl,
    connect,
    addDemoSticker,
    initialize,
    dispose,
    copyOverlayUrl,
    toggleStickerPin,
    moveSticker,
    removeSticker,
  };
});
