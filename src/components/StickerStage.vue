<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import StickerCard from "./StickerCard.vue";
import type { Sticker } from "../types";

type DragDirection =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-right"
  | "bottom-left";

const props = withDefaults(
  defineProps<{
    stickers: Sticker[];
    channel: string;
    preview?: boolean;
    safeAreaExcluded: boolean;
    editable?: boolean;
    queueSize?: number;
  }>(),
  {
    preview: false,
    editable: false,
    queueSize: 0,
  },
);

const emit = defineEmits<{
  demo: [];
  togglePin: [id: number];
  move: [id: number, x: number, y: number];
  remove: [id: number];
}>();

const safeTop = defineModel<number>("safeTop", { required: true });
const safeRight = defineModel<number>("safeRight", { required: true });
const safeBottom = defineModel<number>("safeBottom", { required: true });
const safeLeft = defineModel<number>("safeLeft", { required: true });
const stageElement = ref<HTMLElement | null>(null);
const resizeDirections: DragDirection[] = [
  "top",
  "right",
  "bottom",
  "left",
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
];

function forwardTogglePin(id: number) {
  emit("togglePin", id);
}

function forwardMove(id: number, x: number, y: number) {
  emit("move", id, x, y);
}

function forwardRemove(id: number) {
  emit("remove", id);
}

const safeAreaStyle = computed(
  () =>
    ({
      inset: `${safeTop.value}% ${safeRight.value}% ${safeBottom.value}% ${safeLeft.value}%`,
    }) as CSSProperties,
);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function startResize(event: PointerEvent, direction: DragDirection) {
  const stage = stageElement.value;

  if (!stage) {
    return;
  }

  event.preventDefault();

  const bounds = stage.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const initial = {
    top: safeTop.value,
    right: safeRight.value,
    bottom: safeBottom.value,
    left: safeLeft.value,
  };
  const minimumSize = 20;

  function resize(moveEvent: PointerEvent) {
    const deltaX = ((moveEvent.clientX - startX) / bounds.width) * 100;
    const deltaY = ((moveEvent.clientY - startY) / bounds.height) * 100;

    if (direction.includes("left")) {
      safeLeft.value = clamp(
        initial.left + deltaX,
        0,
        100 - initial.right - minimumSize,
      );
    }

    if (direction.includes("right")) {
      safeRight.value = clamp(
        initial.right - deltaX,
        0,
        100 - initial.left - minimumSize,
      );
    }

    if (direction.includes("top")) {
      safeTop.value = clamp(
        initial.top + deltaY,
        0,
        100 - initial.bottom - minimumSize,
      );
    }

    if (direction.includes("bottom")) {
      safeBottom.value = clamp(
        initial.bottom - deltaY,
        0,
        100 - initial.top - minimumSize,
      );
    }
  }

  function stopResize() {
    window.removeEventListener("pointermove", resize);
    window.removeEventListener("pointerup", stopResize);
    window.removeEventListener("pointercancel", stopResize);
  }

  window.addEventListener("pointermove", resize);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
}
</script>

<template>
  <div v-if="preview" class="preview-card">
    <div class="preview-top">
      <span>
        ПРЕДПРОСМОТР / 1920×1080
        <b v-if="queueSize > 0">В ОЧЕРЕДИ: {{ queueSize }}</b>
      </span>
      <button @click="$emit('demo')">+ Тестовый стикер</button>
    </div>

    <div ref="stageElement" class="stage mini">
      <div v-if="safeAreaExcluded" class="excluded-stickers-layer">
        <StickerCard
          v-for="sticker in stickers"
          :key="sticker.id"
          :sticker="sticker"
          :channel="channel"
          @toggle-pin="forwardTogglePin"
          @move="forwardMove"
          @remove="forwardRemove"
        />
      </div>

      <div
        :class="[
          'safe-area',
          'editable-safe-area',
          { 'exclusion-area': safeAreaExcluded },
        ]"
        :style="safeAreaStyle"
      >
        <StickerCard
          v-if="!safeAreaExcluded"
          v-for="sticker in stickers"
          :key="sticker.id"
          :sticker="sticker"
          :channel="channel"
          @toggle-pin="forwardTogglePin"
          @move="forwardMove"
          @remove="forwardRemove"
        />
        <span class="safe-area-label">
          {{ safeAreaExcluded ? "NO STICKERS" : "SAFE AREA" }}
        </span>

        <button
          v-for="direction in resizeDirections"
          :key="direction"
          :class="['safe-handle', `safe-handle--${direction}`]"
          :aria-label="`Изменить границу: ${direction}`"
          @pointerdown="startResize($event, direction)"
        />
      </div>
    </div>
  </div>

  <section v-else ref="stageElement" class="stage full">
    <div
      v-if="safeAreaExcluded"
      class="excluded-stickers-layer overlay-stickers-layer"
    >
      <StickerCard
        v-for="sticker in stickers"
        :key="sticker.id"
        :sticker="sticker"
        :channel="channel"
        @toggle-pin="forwardTogglePin"
        @move="forwardMove"
        @remove="forwardRemove"
      />
    </div>
    <div
      v-else
      :class="[
        'safe-area',
        'overlay-safe-area',
        { 'editable-overlay-area': editable },
      ]"
      :style="safeAreaStyle"
    >
      <StickerCard
        v-for="sticker in stickers"
        :key="sticker.id"
        :sticker="sticker"
        :channel="channel"
        @toggle-pin="forwardTogglePin"
        @move="forwardMove"
        @remove="forwardRemove"
      />
      <template v-if="editable">
        <span class="safe-area-label">SAFE AREA</span>
        <button
          v-for="direction in resizeDirections"
          :key="direction"
          :class="['safe-handle', `safe-handle--${direction}`]"
          :aria-label="`Изменить границу: ${direction}`"
          @pointerdown="startResize($event, direction)"
        />
      </template>
    </div>

    <div
      v-if="safeAreaExcluded && editable"
      class="safe-area exclusion-area editable-overlay-area"
      :style="safeAreaStyle"
    >
      <span class="safe-area-label">NO STICKERS</span>
      <button
        v-for="direction in resizeDirections"
        :key="direction"
        :class="['safe-handle', `safe-handle--${direction}`]"
        :aria-label="`Изменить границу: ${direction}`"
        @pointerdown="startResize($event, direction)"
      />
    </div>
    <slot />
  </section>
</template>
