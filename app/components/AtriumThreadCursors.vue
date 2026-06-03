<script setup lang="ts">
// Right-margin reading-cursor track. Each peer reading this thread is shown
// as a tiny avatar dot positioned at their fractional scroll. Hovering a dot
// reveals the name; clicking it scrolls the local viewport to that peer's
// current post.

import type { ThreadCursor } from "~/composables/useAtriumThreadCursors";

const props = defineProps<{
  threadId: string;
}>();

const cursors = useAtriumThreadCursors(props.threadId);
const { publicKeyB64 } = useAbracadabra();

// Groups with more than this many peers collapse the tail into a "+N" pill
// the user can click to fan out.
const MAX_VISIBLE_PER_GROUP = 2;
const fannedGroups = ref<Set<number>>(new Set());

function toggleFan(idx: number) {
  const next = new Set(fannedGroups.value);
  if (next.has(idx)) next.delete(idx);
  else next.add(idx);
  fannedGroups.value = next;
}

// Stack dots that crowd within ~2.4% of each other so heavy overlap reads
// as a single column instead of a smear.
const stacked = computed(() => {
  const list = [...cursors.cursors.value].sort((a, b) => a.fraction - b.fraction);
  const buckets: ThreadCursor[][] = [];
  for (const c of list) {
    const last = buckets[buckets.length - 1];
    if (last && Math.abs(last[0]!.fraction - c.fraction) < 0.024) {
      last.push(c);
    }
    else {
      buckets.push([c]);
    }
  }
  return buckets;
});

function scrollToPeer(peer: ThreadCursor) {
  if (!peer.postId) return;
  const target = document.querySelector(`[data-post-id="${peer.postId}"]`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}
</script>

<template>
  <aside
    v-if="cursors.cursors.value.length > 0"
    class="atrium-thread-cursors"
    aria-label="Peers reading this thread"
  >
    <div
      v-for="(group, gi) in stacked"
      :key="gi"
      class="atrium-thread-cursors__group"
      :style="{ top: `${group[0]!.fraction * 100}%` }"
    >
      <template
        v-for="(c, ci) in (
          group.length > MAX_VISIBLE_PER_GROUP && !fannedGroups.has(gi)
            ? group.slice(0, MAX_VISIBLE_PER_GROUP)
            : group
        )"
        :key="c.clientId"
      >
        <AtriumPeerCard
          :name="c.name"
          :color="c.color"
          :client-id="c.clientId"
          :public-key="c.publicKey"
          :is-me="c.publicKey === publicKeyB64"
        >
          <button
            type="button"
            class="atrium-thread-cursors__dot"
            :style="{
              background: c.color,
              marginTop: ci === 0 ? '0' : '-4px',
              zIndex: 10 - ci,
            }"
            :title="`${c.name} is reading here · click to jump`"
            @click="scrollToPeer(c)"
          >
            <span class="atrium-thread-cursors__init">{{ initials(c.name) }}</span>
            <span
              v-if="c.publicKey === publicKeyB64"
              class="atrium-thread-cursors__mine"
              aria-hidden="true"
            />
          </button>
        </AtriumPeerCard>
      </template>
      <button
        v-if="group.length > MAX_VISIBLE_PER_GROUP && !fannedGroups.has(gi)"
        type="button"
        class="atrium-thread-cursors__more"
        :title="`${group.length - MAX_VISIBLE_PER_GROUP} more here — click to expand`"
        @click="toggleFan(gi)"
      >
        +{{ group.length - MAX_VISIBLE_PER_GROUP }}
      </button>
      <button
        v-else-if="group.length > MAX_VISIBLE_PER_GROUP && fannedGroups.has(gi)"
        type="button"
        class="atrium-thread-cursors__more atrium-thread-cursors__more--collapse"
        title="Collapse"
        @click="toggleFan(gi)"
      >
        <UIcon name="i-lucide-chevrons-up" class="size-3" />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.atrium-thread-cursors {
  position: fixed;
  top: 60px;
  bottom: 24px;
  right: var(--atrium-rrail-right-offset, 244px);
  width: 18px;
  pointer-events: none;
  z-index: 4;
}
@media (max-width: 1024px) {
  .atrium-thread-cursors {
    right: 12px;
  }
}
.atrium-thread-cursors__group {
  position: absolute;
  right: 0;
  transform: translateY(-50%);
  pointer-events: auto;
}
.atrium-thread-cursors__dot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  border: 2px solid var(--ui-bg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  padding: 0;
  font-size: 0.55rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: 0.02em;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.atrium-thread-cursors__dot:hover {
  transform: scale(1.25);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
  z-index: 20 !important;
}
.atrium-thread-cursors__init {
  position: relative;
  z-index: 1;
  mix-blend-mode: difference;
}
.atrium-thread-cursors__mine {
  position: absolute;
  inset: -3px;
  border-radius: 9999px;
  border: 1.5px solid var(--ui-primary);
}
.atrium-thread-cursors__more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 14px;
  margin-top: -2px;
  padding: 0;
  border: 2px solid var(--ui-bg);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ui-text-dimmed) 60%, transparent);
  color: var(--ui-bg);
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  pointer-events: auto;
}
.atrium-thread-cursors__more:hover {
  transform: scale(1.15);
  background: var(--ui-primary);
}
.atrium-thread-cursors__more--collapse {
  background: color-mix(in srgb, var(--ui-primary) 60%, transparent);
}
</style>
