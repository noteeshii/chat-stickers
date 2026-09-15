<script setup lang="ts">
import { computed, ref } from "vue";
import type { MessageFragment } from "../types";

const props = defineProps<{
  text: string;
  content?: MessageFragment[];
  channel: string;
}>();
const failedImages = ref(new Set<string>());

function highlight(text: string) {
  const channel = props.channel.trim().replace(/^[@#]/, "");
  if (!channel) return [{ text, highlighted: false }];
  const escaped = channel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|[^a-zA-Z0-9_])(@?${escaped})(?=$|[^a-zA-Z0-9_])`,
    "gi",
  );
  const parts = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[1].length;
    parts.push({ text: text.slice(cursor, start), highlighted: false });
    parts.push({ text: match[2], highlighted: true });
    cursor = start + match[2].length;
  }
  parts.push({ text: text.slice(cursor), highlighted: false });
  return parts;
}

type RenderFragment =
  | Exclude<MessageFragment, { type: "text" }>
  | { type: "text"; text: string; highlighted: boolean };
const parts = computed(() =>
  (
    props.content ?? [{ type: "text", text: props.text }]
  ).flatMap<RenderFragment>((part) =>
    part.type === "text"
      ? highlight(part.text).map((item) => ({ type: "text" as const, ...item }))
      : [part],
  ),
);
</script>

<template>
  <p class="message-content">
    <template v-for="(part, index) in parts" :key="index"
      ><span
        v-if="part.type === 'text'"
        :class="{ 'channel-mention': part.highlighted }"
        >{{ part.text }}</span
      ><span v-else-if="failedImages.has(part.url)">{{ part.code }}</span
      ><img
        v-else
        class="message-emote"
        :src="part.url"
        :alt="part.code"
        :title="part.code"
        :style="{
          width: `${1.5 * ((part.width || 1) / (part.height || 1))}em`,
        }"
        draggable="false"
        @error="failedImages.add(part.url)"
    /></template>
  </p>
</template>
