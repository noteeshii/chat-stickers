<script setup lang="ts">
import type { UserRole } from "../types";

defineProps<{
  roles: UserRole[];
}>();

const badgeNames: Record<UserRole, string> = {
  channelOwner: "Владелец канала",
  moderator: "Модератор",
  vip: "VIP",
  subscriber: "Подписчик",
  follower: "Фолловер",
};
</script>

<template>
  <div v-if="roles.length" class="user-badges">
    <span
      v-for="role in roles"
      :key="role"
      :class="['user-badge', `user-badge--${role}`]"
      :title="badgeNames[role]"
      :aria-label="badgeNames[role]"
    >
      <svg
        v-if="role === 'channelOwner'"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          class="cherry-stems"
          d="M6.2 11.1C7 7.3 9.1 3.8 12.8 2.1M12.8 2.1c1.9 2.6 2.9 5.7 2.8 9"
        />
        <path
          class="cherry-leaf"
          d="M12 2.8C8.7 1.5 5.9 2.7 4.6 6.2 8 6.5 10.7 5.2 12 2.8Z"
        />
        <path
          class="cherry-fruit"
          d="M6.1 9.7c2.9 0 4.8 1.8 4.6 4.5-.2 2.6-2.1 4.3-4.8 4.3-2.8 0-4.7-1.8-4.7-4.5 0-2.6 2-4.3 4.9-4.3Zm8.9 0c2.5-.1 4 1.6 3.9 4.2-.1 2.8-2 4.6-4.8 4.6-2.7 0-4.5-1.7-4.5-4.3 0-2.7 2-4.4 5.4-4.5Z"
        />
      </svg>

      <svg
        v-else-if="role === 'moderator'"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path d="m15.2 1.5 3.3 3.3-9.1 9.1-3.3-3.3 9.1-9.1Z" />
        <path d="m4.9 9.4 5.7 5.7-1.8 1.8-5.7-5.7 1.8-1.8Z" />
        <path d="m4.5 13.6 1.9 1.9-3 3H1.5v-1.9l3-3Z" />
      </svg>

      <svg v-else-if="role === 'vip'" viewBox="0 0 20 20" aria-hidden="true">
        <path d="m10 1.8 7.5 7.1L10 18.2 2.5 8.9 10 1.8Z" />
        <path
          d="M2.8 8.9h14.4M6.2 3.8 8 8.9l2-7.1 2-7.1 2 7.1 1.8-5.1M8 8.9l2 9.3 2-9.3"
        />
      </svg>

      <svg
        v-else-if="role === 'subscriber'"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          d="m10 1.7 2.4 5 5.5.8-4 3.9.9 5.5-4.8-2.6-4.8 2.6.9-5.5-4-3.9 5.5-.8 2.4-5Z"
        />
      </svg>

      <svg v-else viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M10 17.8S2.3 13.5 2.3 7.4A4.3 4.3 0 0 1 10 4.8a4.3 4.3 0 0 1 7.7 2.6c0 6.1-7.7 10.4-7.7 10.4Z"
        />
      </svg>
    </span>
  </div>
</template>
