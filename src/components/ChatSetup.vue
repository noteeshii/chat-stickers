<script setup lang="ts">
import { ref, watch } from "vue";
import type { ConnectionStatus, OverlayProfile } from "../types";
const props = defineProps<{
  status: ConnectionStatus;
  statusText: string;
  syncStatus: "connecting" | "connected" | "disconnected";
  syncStatusText: string;
  profileControls?: boolean;
  profileId?: string;
  profiles?: OverlayProfile[];
}>();
const emit = defineEmits<{
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
const profileDraft = ref(profileName.value);
const profileMenuOpen = ref(false);

watch(profileName, (value) => {
  profileDraft.value = value;
});

function applyProfileField() {
  const value = profileDraft.value.trim();
  const selectedProfile = props.profiles?.find(
    (profile) => profile.name === value,
  );

  if (selectedProfile && selectedProfile.id !== props.profileId) {
    emit("selectProfile", selectedProfile.id);
    profileMenuOpen.value = false;
    return;
  }

  if (value) {
    profileName.value = value;
  } else {
    profileDraft.value = profileName.value;
  }

  profileMenuOpen.value = false;
}

function selectProfileOption(profile: OverlayProfile) {
  profileDraft.value = profile.name;
  profileMenuOpen.value = false;

  if (profile.id !== props.profileId) {
    emit("selectProfile", profile.id);
  }
}
</script>
<template>
  <form
    :class="['control-card', { 'horizontal-controls': profileControls }]"
    @submit.prevent="$emit('connect')"
  >
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
        <input
          v-model="profileDraft"
          class="profile-combobox"
          autocomplete="off"
          @focus="profileMenuOpen = true"
          @change="applyProfileField"
          @keydown.enter.prevent="applyProfileField"
          @keydown.escape="profileMenuOpen = false"
        />
        <div v-if="profileMenuOpen" class="profile-menu">
          <button
            v-for="profile in profiles"
            :key="profile.id"
            type="button"
            :class="{ active: profile.id === profileId }"
            @mousedown.prevent="selectProfileOption(profile)"
          >
            <span>{{ profile.name }}</span>
            <small>
              {{ profile.settings.rewardMode ? "Награды" : "Чат" }}
            </small>
          </button>
        </div>
        <button
          class="profile-add-button"
          type="button"
          title="Создать профиль"
          @click="$emit('createProfile')"
        >
          +
        </button>
      </div>
    </div>

    <div class="setting-field channel-setting">
      <label>КАНАЛ TWITCH</label>
      <div class="channel-input">
        <b>#</b>
        <input v-model="channel" placeholder="имя_канала" autocomplete="off" />
      </div>
    </div>

    <div class="setting-field lifetime-setting">
      <label>
        ВРЕМЯ ПОКАЗА
        <output>{{ lifetime }} сек</output>
      </label>
      <input
        v-model.number="lifetime"
        class="range"
        type="range"
        min="3"
        max="30"
      />
    </div>

    <label class="mode-toggle reward-toggle">
      <span>
        РЕЖИМ НАГРАД
        <small>Только сообщения выбранных наград</small>
      </span>
      <input v-model="rewardMode" type="checkbox" />
      <i />
    </label>

    <div class="safe-settings-group">
      <div class="setting-divider">
        <span>SAFE AREA</span>
        <p>Область появления стикеров</p>
      </div>

      <label class="mode-toggle exclusion-toggle">
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
            max="100"
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
            max="100"
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
            max="100"
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
            max="100"
          />
        </label>
      </div>
    </div>

    <div class="connection-controls">
      <button class="primary" type="submit">
        <span>{{
          status === "connected" ? "Переподключить" : "Подключить чат"
        }}</span>
        <b>↗</b>
      </button>
      <div class="connection-states">
        <div :class="['status', status]"><i />{{ statusText }}</div>
        <div :class="['sync-state', syncStatus]">
          <i />
          {{ syncStatusText }}
        </div>
      </div>
    </div>
  </form>
</template>
