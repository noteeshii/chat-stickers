<script setup lang="ts">
import type { ConnectionStatus } from "../types";
defineProps<{
  status: ConnectionStatus;
  statusText: string;
  syncStatus: "connecting" | "connected" | "disconnected";
  syncStatusText: string;
}>();
defineEmits<{ connect: [] }>();
const channel = defineModel<string>("channel", { required: true });
const lifetime = defineModel<number>("lifetime", { required: true });
const rewardMode = defineModel<boolean>("rewardMode", { required: true });
const safeTop = defineModel<number>("safeTop", { required: true });
const safeRight = defineModel<number>("safeRight", { required: true });
const safeBottom = defineModel<number>("safeBottom", { required: true });
const safeLeft = defineModel<number>("safeLeft", { required: true });
const safeAreaExcluded = defineModel<boolean>("safeAreaExcluded", {
  required: true,
});
</script>
<template>
  <form class="control-card" @submit.prevent="$emit('connect')">
    <div class="card-heading">
      <span>01</span>
      <div>
        <h2>Подключить чат</h2>
        <p>Токен и бот не нужны</p>
      </div>
    </div>
    <label>КАНАЛ TWITCH</label>
    <div class="channel-input">
      <b>#</b
      ><input v-model="channel" placeholder="имя_канала" autocomplete="off" />
    </div>
    <label
      >СКОЛЬКО ДЕРЖАТЬ СТИКЕР <output>{{ lifetime }} сек</output></label
    ><input
      v-model.number="lifetime"
      class="range"
      type="range"
      min="3"
      max="30"
    />

    <label class="mode-toggle">
      <span>
        РЕЖИМ НАГРАД
        <small>Только сообщения за баллы канала</small>
      </span>
      <input v-model="rewardMode" type="checkbox" />
      <i />
    </label>

    <div class="setting-divider">
      <span>SAFE AREA</span>
      <p>Область появления стикеров</p>
    </div>

    <label class="mode-toggle">
      <span>
        ЗАПРЕТНАЯ ЗОНА
        <small>Стикеры появляются снаружи рамки</small>
      </span>
      <input v-model="safeAreaExcluded" type="checkbox" />
      <i />
    </label>

    <div class="safe-controls">
      <label>
        СВЕРХУ
        <output>{{ safeTop }}%</output>
        <input
          v-model.number="safeTop"
          class="range"
          type="range"
          min="0"
          max="40"
        />
      </label>
      <label>
        СПРАВА
        <output>{{ safeRight }}%</output>
        <input
          v-model.number="safeRight"
          class="range"
          type="range"
          min="0"
          max="40"
        />
      </label>
      <label>
        СНИЗУ
        <output>{{ safeBottom }}%</output>
        <input
          v-model.number="safeBottom"
          class="range"
          type="range"
          min="0"
          max="40"
        />
      </label>
      <label>
        СЛЕВА
        <output>{{ safeLeft }}%</output>
        <input
          v-model.number="safeLeft"
          class="range"
          type="range"
          min="0"
          max="40"
        />
      </label>
    </div>

    <button class="primary" type="submit">
      <span>{{
        status === "connected" ? "Переподключить" : "Подключить чат"
      }}</span
      ><b>↗</b>
    </button>
    <div :class="['status', status]"><i />{{ statusText }}</div>
    <div :class="['sync-state', syncStatus]">
      <i />
      {{ syncStatusText }}
    </div>
  </form>
</template>
