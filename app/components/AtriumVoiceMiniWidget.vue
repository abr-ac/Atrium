<script setup lang="ts">
// Persistent floating "in voice" chip. Mounted globally in default.vue so
// the WebRTC session survives route changes. Shows the active room + mic
// toggle + leave button + a click-through back to the room page.

const voice = useAtriumVoice();
const nav = useAtriumNav();
const router = useRouter();

const room = computed(() => {
  const id = voice.myRoomId.value;
  if (!id) return null;
  const entry = nav.allEntries.value.find((e) => e.id === id);
  return entry ?? null;
});

const isInVoice = computed(() => !!voice.myRoomId.value);
const muted = computed(() => voice.myMuted.value);
const inhabitants = computed(() =>
  voice.myRoomId.value
    ? voice.inhabitantsIn(voice.myRoomId.value).value
    : [],
);

function goToRoom() {
  const id = voice.myRoomId.value;
  if (!id) return;
  router.push(`/v/${id}`);
}

function toggleMute(ev: Event) {
  ev.stopPropagation();
  voice.toggleMute();
}

function leave(ev: Event) {
  ev.stopPropagation();
  voice.leave();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="atrium-voice-widget">
      <button
        v-if="isInVoice"
        type="button"
        class="atrium-voice-widget"
        :aria-label="`Open voice room ${room?.label ?? ''}`"
        @click="goToRoom"
      >
        <span class="atrium-voice-widget__indicator" aria-hidden="true">
          <UIcon name="i-lucide-radio" class="size-4" />
        </span>
        <span class="atrium-voice-widget__body">
          <span class="atrium-voice-widget__label">
            {{ room?.label ?? "Voice room" }}
          </span>
          <span class="atrium-voice-widget__meta">
            <UIcon
              name="i-lucide-users"
              class="size-3 text-dimmed"
              aria-hidden="true"
            />
            {{ inhabitants.length }} in room
          </span>
        </span>
        <span class="atrium-voice-widget__actions">
          <UTooltip :text="muted ? 'Unmute' : 'Mute'" :delay-duration="200">
            <button
              type="button"
              class="atrium-voice-widget__btn"
              :class="{ 'atrium-voice-widget__btn--muted': muted }"
              :aria-label="muted ? 'Unmute' : 'Mute'"
              @click="toggleMute"
            >
              <UIcon
                :name="muted ? 'i-lucide-mic-off' : 'i-lucide-mic'"
                class="size-4"
              />
            </button>
          </UTooltip>
          <UTooltip text="Leave room" :delay-duration="200">
            <button
              type="button"
              class="atrium-voice-widget__btn atrium-voice-widget__btn--leave"
              aria-label="Leave room"
              @click="leave"
            >
              <UIcon name="i-lucide-phone-off" class="size-4" />
            </button>
          </UTooltip>
        </span>
      </button>
    </Transition>
  </Teleport>
</template>

<style scoped>
.atrium-voice-widget {
  position: fixed;
  left: 50%;
  bottom: 1.25rem;
  transform: translateX(-50%);
  z-index: 80;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.45rem 0.55rem 0.45rem 0.7rem;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--ui-primary) 40%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-primary) 12%, var(--ui-bg-elevated));
  color: var(--ui-text);
  font-size: 0.825rem;
  text-align: left;
  cursor: pointer;
  box-shadow:
    0 12px 24px -12px color-mix(in srgb, black 30%, transparent),
    0 0 0 2px color-mix(in srgb, var(--ui-primary) 18%, transparent);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.atrium-voice-widget:hover {
  transform: translateX(-50%) translateY(-2px);
  box-shadow:
    0 18px 30px -14px color-mix(in srgb, black 35%, transparent),
    0 0 0 3px color-mix(in srgb, var(--ui-primary) 26%, transparent);
}
.atrium-voice-widget__indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 9999px;
  background: var(--ui-primary);
  color: var(--ui-bg);
  animation: atrium-voice-pulse 1.8s ease-in-out infinite;
}
.atrium-voice-widget__body {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
}
.atrium-voice-widget__label {
  font-weight: 600;
  line-height: 1.1;
  max-width: 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.atrium-voice-widget__meta {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
}
.atrium-voice-widget__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.25rem;
}
.atrium-voice-widget__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--ui-primary) 35%, var(--ui-border));
  background: var(--ui-bg);
  color: var(--ui-text);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.atrium-voice-widget__btn:hover {
  background: color-mix(in srgb, var(--ui-primary) 18%, var(--ui-bg));
}
.atrium-voice-widget__btn--muted {
  background: color-mix(in srgb, var(--ui-color-warning-500, #f59e0b) 18%, var(--ui-bg));
  border-color: color-mix(in srgb, var(--ui-color-warning-500, #f59e0b) 50%, var(--ui-border));
  color: var(--ui-color-warning-500, #f59e0b);
}
.atrium-voice-widget__btn--leave {
  background: color-mix(in srgb, var(--ui-color-error-500, #ef4444) 18%, var(--ui-bg));
  border-color: color-mix(in srgb, var(--ui-color-error-500, #ef4444) 50%, var(--ui-border));
  color: var(--ui-color-error-500, #ef4444);
}
.atrium-voice-widget__btn--leave:hover {
  background: var(--ui-color-error-500, #ef4444);
  color: white;
}
@keyframes atrium-voice-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ui-primary) 50%, transparent); }
  50%      { box-shadow: 0 0 0 8px color-mix(in srgb, var(--ui-primary) 0%, transparent); }
}
.atrium-voice-widget-enter-active,
.atrium-voice-widget-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.atrium-voice-widget-enter-from,
.atrium-voice-widget-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
