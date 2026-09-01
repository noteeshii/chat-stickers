<script setup lang="ts">
import type { UserRole } from "../types";

defineProps<{
  roles: UserRole[];
}>();

const badgeNames: Record<UserRole, string> = {
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
      <svg v-if="role === 'moderator'" viewBox="0 0 20 20" aria-hidden="true">
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
