<script setup lang="ts">
// Reaction strip. Each reaction is a tree entry with type='reaction',
// parentId=postId, meta.emoji, meta.author=publicKeyB64. Toggling an emoji
// either deletes the current user's reaction with that emoji or creates a
// new one. Counts and "I reacted" status are computed client-side; a server
// runner can denormalise to meta.reactionCounts on the post in Phase 4 if
// the per-post entry list grows expensive to scan.

import type { TreeEntry } from "#imports";

const props = defineProps<{
  postId: string;
  // The tree returned from useChildTree on the parent page — passed in to
  // avoid re-subscribing per post.
  tree: ReturnType<typeof useChildTree>;
}>();

const { publicKeyB64 } = useAbracadabra();

const QUICK_PALETTE = ["👍", "❤️", "😂", "🎉", "🚀", "👀"] as const;

const reactions = computed<TreeEntry[]>(() =>
  props.tree.entries.value.filter(
    (e) => e.parentId === props.postId && e.type === "reaction",
  ),
);

interface Tally {
  emoji: string;
  count: number;
  mine: string | null; // entry id if I reacted, else null
}

const tally = computed<Tally[]>(() => {
  const byEmoji = new Map<string, Tally>();
  for (const r of reactions.value) {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    const emoji = (meta.emoji as string) ?? r.label;
    const author = (meta.author as string) ?? "";
    const cur = byEmoji.get(emoji) ?? { emoji, count: 0, mine: null };
    cur.count += 1;
    if (author === publicKeyB64.value) cur.mine = r.id;
    byEmoji.set(emoji, cur);
  }
  return Array.from(byEmoji.values()).sort((a, b) => b.count - a.count);
});

const paletteOpen = ref(false);

function toggle(emoji: string) {
  // If I already reacted with this emoji, remove that reaction.
  const existing = reactions.value.find((r) => {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    const author = (meta.author as string) ?? "";
    const e = (meta.emoji as string) ?? r.label;
    return author === publicKeyB64.value && e === emoji;
  });
  if (existing) {
    props.tree.deleteEntry(existing.id);
    return;
  }
  const id = props.tree.createChild(props.postId, emoji, "reaction");
  props.tree.updateMeta(id, {
    emoji,
    author: publicKeyB64.value,
  } as Record<string, unknown>);
}

function quickReact(emoji: string) {
  toggle(emoji);
  paletteOpen.value = false;
}
</script>

<template>
  <div class="atrium-reactions">
    <button
      v-for="t in tally"
      :key="t.emoji"
      type="button"
      class="atrium-reactions__chip"
      :class="{ 'atrium-reactions__chip--mine': t.mine }"
      :aria-pressed="!!t.mine"
      @click="toggle(t.emoji)"
    >
      <span class="atrium-reactions__emoji">{{ t.emoji }}</span>
      <span class="atrium-reactions__count">{{ t.count }}</span>
    </button>

    <UPopover v-model:open="paletteOpen" :ui="{ content: 'p-1' }">
      <button
        type="button"
        class="atrium-reactions__plus"
        :aria-label="'Add reaction'"
      >
        <UIcon name="i-lucide-smile-plus" class="size-3.5" />
      </button>
      <template #content>
        <div class="atrium-reactions__palette">
          <button
            v-for="e in QUICK_PALETTE"
            :key="e"
            type="button"
            class="atrium-reactions__paletteBtn"
            @click="quickReact(e)"
          >
            {{ e }}
          </button>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<style scoped>
.atrium-reactions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.atrium-reactions__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}
.atrium-reactions__chip:hover {
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border));
}
.atrium-reactions__chip--mine {
  background: color-mix(in srgb, var(--ui-primary) 12%, var(--ui-bg));
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border));
  color: var(--ui-primary);
}
.atrium-reactions__emoji {
  font-size: 0.875rem;
}
.atrium-reactions__count {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.atrium-reactions__plus {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.4rem;
  border-radius: 9999px;
  border: 1px dashed var(--ui-border);
  background: transparent;
  color: var(--ui-text-dimmed);
  cursor: pointer;
}
.atrium-reactions__plus:hover {
  color: var(--ui-primary);
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border));
}
.atrium-reactions__palette {
  display: flex;
  gap: 0.15rem;
}
.atrium-reactions__paletteBtn {
  padding: 0.3rem 0.45rem;
  border-radius: 0.4rem;
  font-size: 1.05rem;
  line-height: 1;
  background: transparent;
  border: none;
  cursor: pointer;
}
.atrium-reactions__paletteBtn:hover {
  background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
}
</style>
