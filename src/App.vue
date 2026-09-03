<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import AppHeader from "./components/AppHeader.vue";
import ChatSetup from "./components/ChatSetup.vue";
import HeroSection from "./components/HeroSection.vue";
import ObsSetup from "./components/ObsSetup.vue";
import OverlaySettings from "./components/OverlaySettings.vue";
import StickerStage from "./components/StickerStage.vue";
import { useChatStickersStore } from "./stores/chatStickers";

const store = useChatStickersStore();
const {
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
  status,
  syncStatus,
  stickers,
  queuedStickerCount,
  statusText,
  syncStatusText,
  overlayUrl,
} = storeToRefs(store);
const {
  connect,
  addDemoSticker,
  initialize,
  dispose,
  copyOverlayUrl,
  selectProfile,
  createProfile,
  toggleStickerPin,
  moveSticker,
  removeSticker,
} = store;
const overlaySettingsOpen = ref(false);

onMounted(initialize);
onBeforeUnmount(dispose);
</script>

<template>
  <main :class="['app', { overlay: isOverlay }]">
    <section v-if="!isOverlay" class="shell">
      <AppHeader />
      <HeroSection />
      <div class="workspace">
        <ChatSetup
          v-model:profile-name="profileName"
          v-model:channel="channel"
          v-model:lifetime="lifetime"
          v-model:reward-mode="rewardMode"
          v-model:safe-top="safeTop"
          v-model:safe-right="safeRight"
          v-model:safe-bottom="safeBottom"
          v-model:safe-left="safeLeft"
          v-model:safe-area-excluded="safeAreaExcluded"
          :status="status"
          :status-text="statusText"
          :sync-status="syncStatus"
          :sync-status-text="syncStatusText"
          :profile-id="profileId"
          :profiles="profiles"
          profile-controls
          @select-profile="selectProfile"
          @create-profile="createProfile"
          @connect="connect"
        />
        <StickerStage
          :stickers="stickers"
          :channel="channel"
          :queue-size="queuedStickerCount"
          v-model:safe-top="safeTop"
          v-model:safe-right="safeRight"
          v-model:safe-bottom="safeBottom"
          v-model:safe-left="safeLeft"
          :safe-area-excluded="safeAreaExcluded"
          preview
          @demo="addDemoSticker"
          @toggle-pin="toggleStickerPin"
          @move="moveSticker"
          @remove="removeSticker"
        />
      </div>
      <ObsSetup :overlay-url="overlayUrl" @copy="copyOverlayUrl" />
      <footer>
        <span>NO LOGIN · NO BOT · JUST CHAT</span
        ><span>MADE FOR STREAMERS ✦</span>
      </footer>
    </section>
    <StickerStage
      v-else
      :stickers="stickers"
      :channel="channel"
      v-model:safe-top="safeTop"
      v-model:safe-right="safeRight"
      v-model:safe-bottom="safeBottom"
      v-model:safe-left="safeLeft"
      :safe-area-excluded="safeAreaExcluded"
      :editable="overlaySettingsOpen"
      @toggle-pin="toggleStickerPin"
      @move="moveSticker"
      @remove="removeSticker"
      ><div v-if="status === 'error'" class="error-badge">
        Не удалось подключиться к #{{ channel }}
      </div></StickerStage
    >
    <OverlaySettings
      v-if="isOverlay"
      v-model:open="overlaySettingsOpen"
      v-model:profile-name="profileName"
      v-model:channel="channel"
      v-model:lifetime="lifetime"
      v-model:reward-mode="rewardMode"
      v-model:safe-top="safeTop"
      v-model:safe-right="safeRight"
      v-model:safe-bottom="safeBottom"
      v-model:safe-left="safeLeft"
      v-model:safe-area-excluded="safeAreaExcluded"
      :status="status"
      :status-text="statusText"
      :sync-status="syncStatus"
      :sync-status-text="syncStatusText"
      @connect="connect"
    />
  </main>
</template>
