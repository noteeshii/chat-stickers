<script setup lang="ts">
import type { ConnectionStatus, OverlayProfile } from "../types";
defineProps<{
  status: ConnectionStatus;
  statusText: string;
  syncStatus: "connecting" | "connected" | "disconnected";
  syncStatusText: string;
  profileControls?: boolean;
  profileId?: string;
  profiles?: OverlayProfile[];
}>();
defineEmits<{
  connect: [];
  selectProfile: [id: string];
  createProfile: [];
}>();
const profileName = defineModel<string>("profileName", { required: true });
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

    <div v-if="profileControls" class="profile-controls">
      <label>ПРОФИЛЬ ОВЕРЛЕЯ</label>
      <div class="profile-picker">
        <select
          :value="profileId"
          @change="
            $emit('selectProfile', ($event.target as HTMLSelectElement).value)
          "
        >
          <option
            v-for="profile in profiles"
            :key="profile.id"
            :value="profile.id"
          >
            {{ profile.name }} ·
            {{ profile.settings.rewardMode ? "награды" : "чат" }}
            {{ profile.clientCount ? ` · ${profile.clientCount}` : "" }}
          </option>
        </select>
        <button
          type="button"
          title="Создать профиль"
          @click="$emit('createProfile')"
        >
          +
        </button>
      </div>
      <label>НАЗВАНИЕ ПРОФИЛЯ</label>
      <input
        v-model="profileName"
        class="profile-name-input"
        autocomplete="off"
      />
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
        <small>Только сообщения выбранных наград</small>
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
