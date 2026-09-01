<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import UserBadges from "./UserBadges.vue";
import type { Sticker } from "../types";

const props = defineProps<{
  sticker: Sticker;
  channel: string;
}>();
const emit = defineEmits<{
  togglePin: [id: number];
  move: [id: number, x: number, y: number];
  remove: [id: number];
}>();
const isDragging = ref(false);

const position = computed(
  () =>
    ({
      left: `${props.sticker.x}%`,
      top: `${props.sticker.y}%`,
      "--rotate": `${props.sticker.rotation}deg`,
      "--paper": props.sticker.color,
    }) as CSSProperties,
);

const effectClass = computed(() => `sticker--${props.sticker.effect}`);
const effectNames: Record<Sticker["effect"], string> = {
  none: "",
  foil: "ФОЛЬГА",
  holographic: "ГОЛО",
  polychrome: "ПОЛИХРОМ",
  gold: "ЗОЛОТО",
};

const messageParts = computed(() => {
  const channelName = props.channel.trim().replace(/^[@#]/, "");

  if (!channelName) {
    return [{ text: props.sticker.text, highlighted: false }];
  }

  const specialCharacters = "\\^$.*+?()[]{}|";
  const escapedChannel = [...channelName]
    .map((character) =>
      specialCharacters.includes(character) ? "\\\\" + character : character,
    )
    .join("");
  const mentionPattern = new RegExp(
    `(^|[^a-zA-Z0-9_])(@?${escapedChannel})(?=$|[^a-zA-Z0-9_])`,
    "gi",
  );
  const parts: Array<{ text: string; highlighted: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(props.sticker.text)) !== null) {
    const mentionStart = match.index + match[1].length;

    if (mentionStart > lastIndex) {
      parts.push({
        text: props.sticker.text.slice(lastIndex, mentionStart),
        highlighted: false,
      });
    }

    parts.push({
      text: match[2],
      highlighted: true,
    });
    lastIndex = mentionStart + match[2].length;
  }

  if (lastIndex < props.sticker.text.length) {
    parts.push({
      text: props.sticker.text.slice(lastIndex),
      highlighted: false,
    });
  }

  return parts.length
    ? parts
    : [{ text: props.sticker.text, highlighted: false }];
});

function startDragging(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  const stickerElement = event.currentTarget as HTMLElement;
  const positionContainer = stickerElement.parentElement;
  const stage = stickerElement.closest(".stage");

  if (!positionContainer || !stage) {
    return;
  }

  const containerElement = positionContainer;
  const stageElement = stage;

  event.preventDefault();
  stickerElement.setPointerCapture(event.pointerId);

  const startX = event.clientX;
  const startY = event.clientY;
  const stickerBounds = stickerElement.getBoundingClientRect();
  const pointerOffsetX = event.clientX - stickerBounds.left;
  const pointerOffsetY = event.clientY - stickerBounds.top;
  let hasMoved = false;

  function move(moveEvent: PointerEvent) {
    const distance = Math.hypot(
      moveEvent.clientX - startX,
      moveEvent.clientY - startY,
    );

    if (distance < 5 && !hasMoved) {
      return;
    }

    hasMoved = true;
    isDragging.value = true;

    const containerBounds = containerElement.getBoundingClientRect();
    const x =
      ((moveEvent.clientX - containerBounds.left - pointerOffsetX) /
        containerBounds.width) *
      100;
    const y =
      ((moveEvent.clientY - containerBounds.top - pointerOffsetY) /
        containerBounds.height) *
      100;

    emit("move", props.sticker.id, x, y);
  }

  function stopDragging(upEvent: PointerEvent) {
    stickerElement.removeEventListener("pointermove", move);
    stickerElement.removeEventListener("pointerup", stopDragging);
    stickerElement.removeEventListener("pointercancel", stopDragging);

    if (!hasMoved) {
      emit("togglePin", props.sticker.id);
      return;
    }

    const stageBounds = stageElement.getBoundingClientRect();
    const isOutsideStage =
      upEvent.clientX < stageBounds.left ||
      upEvent.clientX > stageBounds.right ||
      upEvent.clientY < stageBounds.top ||
      upEvent.clientY > stageBounds.bottom;

    if (isOutsideStage) {
      emit("remove", props.sticker.id);
      isDragging.value = false;
      return;
    }

    const containerBounds = containerElement.getBoundingClientRect();
    const maximumX =
      ((containerBounds.width - stickerElement.offsetWidth) /
        containerBounds.width) *
      100;
    const maximumY =
      ((containerBounds.height - stickerElement.offsetHeight) /
        containerBounds.height) *
      100;

    emit(
      "move",
      props.sticker.id,
      Math.min(Math.max(props.sticker.x, 0), Math.max(0, maximumX)),
      Math.min(Math.max(props.sticker.y, 0), Math.max(0, maximumY)),
    );
    isDragging.value = false;
  }

  stickerElement.addEventListener("pointermove", move);
  stickerElement.addEventListener("pointerup", stopDragging);
  stickerElement.addEventListener("pointercancel", stopDragging);
}
</script>

<template>
  <div
    :class="[
      'sticker',
      effectClass,
      {
        leaving: sticker.leaving,
        pinned: sticker.pinned,
        dragging: isDragging,
      },
    ]"
    :style="position"
    @pointerdown="startDragging"
  >
    <span class="sticker-effect" />
    <span
      :class="['tape', 'tape--clear', { 'tape--pinned-top': sticker.pinned }]"
    />
    <span v-if="sticker.pinned" class="tape tape--clear tape--bottom" />
    <UserBadges :roles="sticker.roles" />
    <b>@{{ sticker.author }}</b>
    <p>
      <span
        v-for="(part, index) in messageParts"
        :key="index"
        :class="{ 'channel-mention': part.highlighted }"
      >
        {{ part.text }}
      </span>
    </p>
    <div v-if="sticker.effect !== 'none'" class="sticker-footer">
      <span class="effect-name"> ✦ {{ effectNames[sticker.effect] }} </span>
    </div>
  </div>
</template>
