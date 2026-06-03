<script setup lang="ts">
// Small live count of voice-room inhabitants for use in the sidebar. Renders
// a green pulse dot + count when someone is there, nothing otherwise.

const props = defineProps<{
  roomId: string;
}>();

const voice = useAtriumVoice();
const count = voice.countIn(props.roomId);
</script>

<template>
  <span v-if="count > 0" class="atrium-voicebadge">
    <span class="atrium-voicebadge__dot" aria-hidden="true" />
    <span class="atrium-voicebadge__count">{{ count }}</span>
  </span>
</template>

<style scoped>
.atrium-voicebadge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ui-color-success-500, #10b981);
}
.atrium-voicebadge__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 9999px;
  background: var(--ui-color-success-500, #10b981);
  animation: atrium-voicebadge-pulse 1.6s ease-in-out infinite;
}
@keyframes atrium-voicebadge-pulse {
  0%, 100% { opacity: 0.55; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}
</style>
