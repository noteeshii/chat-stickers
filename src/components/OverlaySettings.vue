<script setup lang="ts">
import ChatSetup from "./ChatSetup.vue";
import type { ConnectionStatus } from "../types";

defineProps<{
  status: ConnectionStatus;
  statusText: string;
  syncStatus: "connecting" | "connected" | "disconnected";
  syncStatusText: string;
}>();

defineEmits<{
  connect: [];
}>();

const channel = defineModel<string>("channel", { required: true });
const profileName = defineModel<string>("profileName", { required: true });
const lifetime = defineModel<number>("lifetime", { required: true });
const rewardMode = defineModel<boolean>("rewardMode", { required: true });
const safeTop = defineModel<number>("safeTop", { required: true });
const safeRight = defineModel<number>("safeRight", { required: true });
const safeBottom = defineModel<number>("safeBottom", { required: true });
const safeLeft = defineModel<number>("safeLeft", { required: true });
const safeAreaExcluded = defineModel<boolean>("safeAreaExcluded", {
  required: true,
});
const isOpen = defineModel<boolean>("open", { default: false });
</script>

<template>
  <div
    class="overlay-edge overlay-edge--left"
    aria-hidden="true"
    @mouseenter="isOpen = true"
  />

  <aside :class="['overlay-settings', { open: isOpen }]">
    <div class="overlay-settings-heading">
      <div>
        <span>LIVE SETTINGS</span>
        <p>Изменения применяются сразу</p>
      </div>
      <button aria-label="Закрыть настройки" @click="isOpen = false">×</button>
    </div>

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
      @connect="$emit('connect')"
    />
  </aside>

  <div
    class="overlay-edge overlay-edge--right"
    aria-hidden="true"
    @mouseenter="isOpen = false"
  />
</template>
