<script setup lang="ts">
// AtriumReactionStream — observes the thread's tree for new reaction
// entries and animates a floating emoji from the matching post upward.
// Tracks "seen" reaction ids on first paint so we don't replay historical
// reactions on initial load; only NEW ones trigger animation.

import type { TreeEntry } from "#imports";

const props = defineProps<{
  threadId: string;
  tree: ReturnType<typeof useChildTree>;
}>();

const { publicKeyB64 } = useAbracadabra();

interface Floater {
  id: string; // unique animation id
  emoji: string;
  postId: string;
  // Origin position resolved from the post's DOM rect at spawn time.
  left: number;
  top: number;
  hueSeed: number;
}

const floaters = ref<Floater[]>([]);
const seen = new Set<string>();
// Anything older than this is "history" we shouldn't animate. The 500ms
// buffer absorbs the gap between mount and the doc's first sync; reactions
// stamped right around mount-time still count as live.
const mountCutoff = Date.now() - 500;

// Walk parentId chain to see if entry is under this thread.
function inThread(e: TreeEntry, threadId: string): boolean {
  let cur: { parentId: string | null } | undefined = e;
  let safety = 0;
  while (cur && cur.parentId && safety++ < 16) {
    if (cur.parentId === threadId) return true;
    cur = props.tree.entries.value.find((x) => x.id === cur!.parentId);
  }
  return false;
}

function spawnFloater(reaction: TreeEntry) {
  const postId = reaction.parentId ?? "";
  if (!postId) return;
  const meta = (reaction.meta ?? {}) as Record<string, unknown>;
  const emoji = (meta.emoji as string) ?? reaction.label ?? "✨";
  const author = (meta.author as string) ?? "";

  // Skip self-reactions; the user already sees the chip change.
  if (author === publicKeyB64.value) return;

  // Find the post row in the DOM. If it's not visible yet, fall back to a
  // generic center-of-feed origin.
  let left = window.innerWidth / 2;
  let top = window.innerHeight / 2;
  const row = document.querySelector(`[data-post-id="${postId}"] .atrium-feed__foot`)
    ?? document.querySelector(`[data-post-id="${postId}"]`);
  if (row instanceof HTMLElement) {
    const rect = row.getBoundingClientRect();
    left = rect.left + rect.width * 0.3 + Math.random() * rect.width * 0.4;
    top = rect.top + rect.height * 0.4;
  }

  const id = `${reaction.id}:${Date.now()}`;
  floaters.value = [
    ...floaters.value,
    {
      id,
      emoji,
      postId,
      left,
      top,
      hueSeed: Math.floor(Math.random() * 30) - 15,
    },
  ];
  // Drop after the animation duration (1.6s + small buffer).
  setTimeout(() => {
    floaters.value = floaters.value.filter((f) => f.id !== id);
  }, 1800);
}

// Use watchEffect so we re-track whenever entries' identity OR length changes.
// useChildTree.entries is a Vue computed that fires when the underlying Y.Map
// changes; watchEffect with a length read ensures we re-run.
watchEffect(() => {
  const entries = props.tree.entries.value;
  void entries.length;
  for (const e of entries) {
    if (e.type !== "reaction") continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const ts = e.createdAt ?? 0;
    if (ts < mountCutoff) continue;
    if (!inThread(e, props.threadId)) continue;
    spawnFloater(e);
  }
});
</script>

<template>
  <Teleport to="body">
    <div class="atrium-react-stream" aria-hidden="true">
      <TransitionGroup name="atrium-react-float">
        <span
          v-for="f in floaters"
          :key="f.id"
          class="atrium-react-stream__emoji"
          :style="{
            left: `${f.left}px`,
            top: `${f.top}px`,
            '--tilt': `${f.hueSeed}deg`,
          }"
        >
          {{ f.emoji }}
        </span>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.atrium-react-stream {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 60;
  overflow: hidden;
}
.atrium-react-stream__emoji {
  position: fixed;
  font-size: 1.7rem;
  user-select: none;
  pointer-events: none;
  transform: translate(-50%, -50%) rotate(var(--tilt, 0deg));
  animation: atrium-react-float 1.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35));
  will-change: transform, opacity;
}
@keyframes atrium-react-float {
  0% {
    transform: translate(-50%, -50%) scale(0.6) rotate(var(--tilt, 0deg));
    opacity: 0;
  }
  20% {
    transform: translate(-50%, -90%) scale(1.15) rotate(var(--tilt, 0deg));
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -260%) scale(0.9) rotate(calc(var(--tilt, 0deg) * 2));
    opacity: 0;
  }
}
.atrium-react-float-enter-active {
  animation: none;
}
</style>
