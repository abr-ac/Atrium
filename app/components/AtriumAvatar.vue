<script setup lang="ts">
// AtriumAvatar — single source of truth for author identity rendering across
// posts, the user chip, and peer lists. Deterministic colour from FNV1a-hash
// of the author key; initials from the first 2 characters of either the
// friendly name (preferred) or the key itself.
//
// The `mine` prop overrides everything with a primary-tinted "ME" badge so
// the user instantly recognises their own posts.

const props = withDefaults(defineProps<{
  /** Author key — public key, awareness color, or arbitrary slug */
  author?: string | null;
  /** Friendly display name override — drives initials when present */
  name?: string | null;
  /** True if this avatar represents the current viewer */
  mine?: boolean;
  /** Optional explicit color override (CSS color); skips hue derivation */
  color?: string;
  /** Avatar size in pixels (renders as a rounded square) */
  size?: number;
  /** Optional connection-status dot in the bottom-right */
  status?: "connected" | "connecting" | "disconnected" | "idle" | null;
}>(), {
  author: "",
  name: null,
  mine: false,
  color: "",
  size: 36,
  status: null,
});

const SEED = "seed";

const effectiveSource = computed(() =>
  props.mine ? "me" : (props.name || props.author || SEED),
);

const hue = computed(() => {
  const s = effectiveSource.value;
  if (props.mine) return 30; // anchor "me" to primary-warm orange-ish
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
});

const initials = computed(() => {
  if (props.mine) return "ME";
  const s = (props.name || props.author || SEED).trim();
  if (!s) return "?";
  // If author looks like a base64 key, just take first 2 chars.
  if (!props.name) return s.slice(0, 2).toUpperCase();
  // Otherwise grab initials from words.
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase();
});

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  "--avatar-hue": hue.value,
  background:
    props.color
    || (props.mine
      ? "color-mix(in srgb, var(--ui-primary) 32%, transparent)"
      : `hsl(${hue.value} 65% 30% / 0.28)`),
  color: props.mine
    ? "var(--ui-primary)"
    : `hsl(${hue.value} 75% 75%)`,
  borderColor: props.mine
    ? "color-mix(in srgb, var(--ui-primary) 60%, transparent)"
    : `hsl(${hue.value} 65% 50% / 0.25)`,
  fontSize: `${Math.max(10, Math.floor(props.size * 0.32))}px`,
}));

const statusClass = computed(() =>
  props.status ? `atrium-avatar__dot--${props.status}` : "",
);
</script>

<template>
  <span class="atrium-avatar" :style="style" :aria-label="initials">
    <span class="atrium-avatar__initials">{{ initials }}</span>
    <span
      v-if="status"
      class="atrium-avatar__dot"
      :class="statusClass"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.atrium-avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  border: 1px solid transparent;
  flex-shrink: 0;
  letter-spacing: 0.04em;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.35);
  font-weight: 700;
}
.atrium-avatar__initials {
  line-height: 1;
}
.atrium-avatar__dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 9999px;
  background: var(--ui-text-dimmed);
  border: 2px solid var(--ui-bg);
}
.atrium-avatar__dot--connected {
  background: var(--ui-color-success-500, #10b981);
}
.atrium-avatar__dot--connecting {
  background: var(--ui-color-warning-500, #f59e0b);
  animation: atrium-avatar-pulse 1.4s ease-in-out infinite;
}
.atrium-avatar__dot--disconnected {
  background: var(--ui-color-error-500, #ef4444);
}
.atrium-avatar__dot--idle {
  background: var(--ui-text-dimmed);
}
@keyframes atrium-avatar-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
</style>
