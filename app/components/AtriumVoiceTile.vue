<script setup lang="ts">
// One participant tile in a voice room. The ring around the avatar is
// driven by the AnalyserNode RMS for that peer — silent peers have a
// quiet 1px ring; speech expands and brightens it.

import type { VoicePresence } from "~/composables/useAtriumVoice";

const props = defineProps<{
  peer: VoicePresence;
}>();

const voice = useAtriumVoice();
const { publicKeyB64 } = useAbracadabra();

const level = voice.levelOf(props.peer.clientId);

// 0..1 → 0..1 with a gamma so quiet voices still register
const eased = computed(() => {
  const l = level.value;
  return l <= 0 ? 0 : Math.pow(l, 0.6);
});

const ringStyle = computed(() => {
  const e = eased.value;
  // Quiet idle ring (1px) → 6px ring at peak
  const ring = 1 + e * 5;
  const glow = 4 + e * 18;
  const intensity = Math.round(20 + e * 75);
  const color = props.peer.muted
    ? "color-mix(in srgb, var(--ui-text-dimmed) 35%, transparent)"
    : `color-mix(in srgb, var(--ui-primary) ${intensity}%, transparent)`;
  return {
    boxShadow: `0 0 0 ${ring}px ${color}, 0 0 ${glow}px ${color}`,
  };
});

// Avatar pulse: subtle 1.0 → 1.06 scale on speech. Muted peers stay still.
const avatarStyle = computed(() => {
  if (props.peer.muted) return { transform: "scale(1)" };
  const e = eased.value;
  const scale = 1 + e * 0.06;
  return { transform: `scale(${scale.toFixed(3)})` };
});
</script>

<template>
  <article
    class="atrium-voice__tile"
    :class="{
      'atrium-voice__tile--speaking': peer.speaking && !peer.muted,
      'atrium-voice__tile--muted': peer.muted,
    }"
  >
    <div class="atrium-voice__avatar-wrap">
      <span class="atrium-voice__ring" :style="ringStyle" aria-hidden="true" />
      <div class="atrium-voice__avatar-pulse" :style="avatarStyle">
        <AtriumPeerCard
          :name="peer.name"
          :color="peer.color"
          :client-id="peer.clientId"
          :public-key="peer.publicKey"
          :is-me="peer.publicKey === publicKeyB64"
          :size="56"
        >
          <button type="button" class="atrium-voice__avatar-btn">
            <AtriumAvatar
              :name="peer.name"
              :color="peer.color"
              :mine="peer.publicKey === publicKeyB64"
              :size="56"
            />
          </button>
        </AtriumPeerCard>
      </div>
    </div>
    <p class="atrium-voice__name">
      {{ peer.name }}
    </p>
    <span class="atrium-voice__meta">
      <UIcon
        v-if="peer.muted"
        name="i-lucide-mic-off"
        class="size-3.5 text-dimmed"
      />
      <UIcon
        v-else-if="peer.speaking"
        name="i-lucide-mic"
        class="size-3.5 text-primary"
      />
      <UIcon
        v-else
        name="i-lucide-mic"
        class="size-3.5 text-dimmed"
      />
      <span v-if="peer.muted" class="text-xs text-dimmed">muted</span>
      <span v-else-if="peer.speaking" class="text-xs text-primary">speaking</span>
      <span v-else class="text-xs text-dimmed">listening</span>
    </span>
  </article>
</template>

<style scoped>
.atrium-voice__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 1rem 0.6rem 0.85rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.7rem;
  background: var(--ui-bg);
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s ease;
}
.atrium-voice__tile--speaking {
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-primary) 4%, var(--ui-bg));
  transform: translateY(-1px);
}
.atrium-voice__tile--muted .atrium-voice__name {
  color: var(--ui-text-dimmed);
}
.atrium-voice__avatar-wrap {
  position: relative;
  isolation: isolate;
}
.atrium-voice__ring {
  position: absolute;
  inset: -2px;
  border-radius: 9999px;
  pointer-events: none;
  z-index: -1;
  transition: box-shadow 0.08s linear;
}
.atrium-voice__avatar-pulse {
  transition: transform 0.08s ease-out;
  transform-origin: center;
}
.atrium-voice__avatar-btn {
  display: inline-flex;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 0.5rem;
}
.atrium-voice__avatar-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ui-primary) 60%, transparent);
  outline-offset: 3px;
}
.atrium-voice__name {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.atrium-voice__meta {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
</style>
