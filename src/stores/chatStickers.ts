import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { ConnectionStatus, OverlayProfile, Sticker } from "../types";

type SyncedSettings = OverlayProfile["settings"];

type StickerSyncAction =
  | { action: "pin"; stickerId: string; pinned: boolean }
  | { action: "move"; stickerId: string; x: number; y: number }
  | { action: "remove"; stickerId: string };

function createProfileId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function readStoredProfile(id: string): OverlayProfile | null {
  try {
    return JSON.parse(localStorage.getItem(`sticker-profile-${id}`) || "null");
  } catch {
    return null;
  }
}

export const useChatStickersStore = defineStore("chat-stickers", () => {
  const params = new URLSearchParams(location.search);
  const obsWindow = window as Window & { obsstudio?: unknown };
  const isRunningInObs =
    typeof obsWindow.obsstudio !== "undefined" ||
    navigator.userAgent.toLowerCase().includes("obs");
  const isOverlay = ref(params.get("overlay") === "1" || isRunningInObs);
  const initialProfileId =
    params.get("profileId") ||
    localStorage.getItem("sticker-active-profile") ||
    createProfileId();
  const storedProfile = readStoredProfile(initialProfileId);
  const urlUpdatedAt = Number(params.get("profileUpdatedAt")) || 0;
  const useStoredProfile =
    storedProfile && storedProfile.updatedAt > urlUpdatedAt;
  const sourceProfile = useStoredProfile ? storedProfile : null;
  const legacySafeHorizontal = Number(
    params.get("safeX") || localStorage.getItem("sticker-safe-horizontal") || 8,
  );
  const legacySafeVertical = Number(
    params.get("safeY") || localStorage.getItem("sticker-safe-vertical") || 8,
  );

  const profileId = ref(initialProfileId);
  const profileName = ref(
    sourceProfile?.name || params.get("profileName") || "Основной оверлей",
  );
  const profileUpdatedAt = ref(
    sourceProfile?.updatedAt || urlUpdatedAt || Date.now(),
  );
  const channel = ref(
    (
      sourceProfile?.settings.channel ||
      params.get("channel") ||
      localStorage.getItem("sticker-channel") ||
      ""
    ).replace(/^@/, ""),
  );
  const lifetime = ref(
    Number(
      sourceProfile?.settings.lifetime ??
        params.get("lifetime") ??
        localStorage.getItem("sticker-lifetime") ??
        12,
    ),
  );
  const rewardMode = ref(
    sourceProfile?.settings.rewardMode ??
      (params.get("rewardMode") === "1" ||
        localStorage.getItem("sticker-reward-mode") === "true"),
  );
  const safeTop = ref(
    Number(
      sourceProfile?.settings.safeTop ??
        params.get("safeTop") ??
        localStorage.getItem("sticker-safe-top") ??
        legacySafeVertical,
    ),
  );
  const safeRight = ref(
    Number(
      sourceProfile?.settings.safeRight ??
        params.get("safeRight") ??
        localStorage.getItem("sticker-safe-right") ??
        legacySafeHorizontal,
    ),
  );
  const safeBottom = ref(
    Number(
      sourceProfile?.settings.safeBottom ??
        params.get("safeBottom") ??
        localStorage.getItem("sticker-safe-bottom") ??
        legacySafeVertical,
    ),
  );
  const safeLeft = ref(
    Number(
      sourceProfile?.settings.safeLeft ??
        params.get("safeLeft") ??
        localStorage.getItem("sticker-safe-left") ??
        legacySafeHorizontal,
    ),
  );
  const safeAreaExcluded = ref(
    sourceProfile?.settings.safeAreaExcluded ??
      (params.get("safeMode") === "exclude" ||
        localStorage.getItem("sticker-safe-mode") === "exclude"),
  );
  const profiles = ref<OverlayProfile[]>([]);
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
  let applyingRemoteProfile = false;
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
        connected: `Профиль: ${profileName.value}`,
        disconnected: "Запустите npm run sync",
      })[syncStatus.value],
  );
  const overlayUrl = computed(() => {
    const pageUrl = location.href.split(/[?#]/)[0];
    const overlayParams = new URLSearchParams({
      overlay: "1",
      profileId: profileId.value,
      profileName: profileName.value,
      profileUpdatedAt: String(profileUpdatedAt.value),
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

  function getSettings(): SyncedSettings {
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

  function getProfile(): OverlayProfile {
    return {
      id: profileId.value,
      name: profileName.value,
      updatedAt: profileUpdatedAt.value,
      settings: getSettings(),
    };
  }

  function send(message: object) {
    if (syncSocket?.readyState === WebSocket.OPEN) {
      syncSocket.send(JSON.stringify(message));
    }
  }

  function persistProfile() {
    const profile = getProfile();
    localStorage.setItem("sticker-active-profile", profile.id);
    localStorage.setItem(
      `sticker-profile-${profile.id}`,
      JSON.stringify(profile),
    );
    localStorage.setItem("sticker-channel", channel.value);
  }

  function sendProfileUpdate() {
    settingsBroadcastFrame = 0;
    send({ type: "profile-update", profile: getProfile() });
  }

  function queueProfileUpdate() {
    if (!applyingRemoteProfile && !settingsBroadcastFrame) {
      settingsBroadcastFrame = requestAnimationFrame(sendProfileUpdate);
    }
  }

  function applyProfile(profile: OverlayProfile) {
    if (!profile || profile.id !== profileId.value) return;
    applyingRemoteProfile = true;
    profileName.value = profile.name;
    profileUpdatedAt.value = profile.updatedAt;
    channel.value = profile.settings.channel;
    lifetime.value = profile.settings.lifetime;
    rewardMode.value = profile.settings.rewardMode;
    safeTop.value = profile.settings.safeTop;
    safeRight.value = profile.settings.safeRight;
    safeBottom.value = profile.settings.safeBottom;
    safeLeft.value = profile.settings.safeLeft;
    safeAreaExcluded.value = profile.settings.safeAreaExcluded;
    applyingRemoteProfile = false;
    persistProfile();
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
        profile: getProfile(),
      });
    });
    syncSocket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === "profile" && message.profile) {
          applyProfile(message.profile);
        } else if (
          message.type === "profile-list" &&
          Array.isArray(message.profiles)
        ) {
          profiles.value = message.profiles;
        } else if (
          message.type === "chat-status" &&
          message.profileId === profileId.value
        ) {
          status.value = message.status;
        } else if (
          message.type === "stickers" &&
          message.profileId === profileId.value
        ) {
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

  function selectProfile(id: string) {
    const selected = profiles.value.find((profile) => profile.id === id);
    if (!selected) return;
    profileId.value = id;
    stickers.value = [];
    queuedStickerCount.value = 0;
    status.value = "idle";
    localStorage.setItem("sticker-active-profile", id);
    send({ type: "select-profile", profileId: id });
  }

  function createProfile() {
    profileId.value = createProfileId();
    profileName.value = `Профиль ${profiles.value.length + 1}`;
    profileUpdatedAt.value = Math.max(Date.now(), profileUpdatedAt.value + 1);
    stickers.value = [];
    queuedStickerCount.value = 0;
    status.value = "idle";
    persistProfile();
    send({ type: "profile-update", profile: getProfile() });
  }

  function connect() {
    const cleanChannel = channel.value
      .trim()
      .toLowerCase()
      .replace(/^[@#]/, "");
    if (!cleanChannel) return;
    channel.value = cleanChannel;
    profileUpdatedAt.value = Math.max(Date.now(), profileUpdatedAt.value + 1);
    persistProfile();
    status.value = "connecting";
    send({ type: "connect-chat", profile: getProfile() });
  }

  function addDemoSticker() {
    send({ type: "demo", profileId: profileId.value });
  }

  function sendStickerAction(action: StickerSyncAction) {
    send({ type: "sticker-action", profileId: profileId.value, ...action });
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
    if (sticker)
      sendStickerAction({ action: "remove", stickerId: sticker.syncId });
  }

  function initialize() {
    syncIsDisposed = false;
    persistProfile();
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
      profileName,
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
      if (applyingRemoteProfile) return;
      profileUpdatedAt.value = Math.max(Date.now(), profileUpdatedAt.value + 1);
      persistProfile();
      queueProfileUpdate();
    },
    { flush: "sync" },
  );

  return {
    isOverlay,
    profileId,
    profileName,
    profiles,
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
    selectProfile,
    createProfile,
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
