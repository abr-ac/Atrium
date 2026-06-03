<script setup lang="ts">
// BookmarkButton — small icon toggle that saves an entry to the personal
// bookmarks store. Sits alongside ReactionStrip in the post action row.
// Private to the local device (R45 promotes to per-user doc).

const props = defineProps<{
  entryId: string;
  label?: string;
  href?: string;
  threadLabel?: string;
  snippet?: string;
}>();

const { isBookmarked, toggle } = useAtriumBookmarks();
const toast = useToast();

const saved = computed(() => isBookmarked(props.entryId));

function onClick() {
  const wasSaved = saved.value;
  toggle(props.entryId, {
    label: props.label,
    href: props.href,
    threadLabel: props.threadLabel,
    snippet: props.snippet,
  });
  toast.add({
    title: wasSaved ? "Bookmark removed" : "Saved",
    description: props.label ?? "",
    icon: wasSaved ? "i-lucide-bookmark" : "i-lucide-bookmark-check",
  });
}
</script>

<template>
  <button
    type="button"
    class="atrium-bookmark-btn"
    :class="{ 'atrium-bookmark-btn--saved': saved }"
    :aria-pressed="saved"
    :title="saved ? 'Remove bookmark' : 'Bookmark for later'"
    @click="onClick"
  >
    <UIcon
      :name="saved ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
      class="size-3.5"
    />
  </button>
</template>

<style scoped>
.atrium-bookmark-btn {
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
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.atrium-bookmark-btn:hover {
  color: var(--ui-primary);
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border));
}
.atrium-bookmark-btn--saved {
  color: var(--ui-primary);
  border-style: solid;
  border-color: color-mix(in srgb, var(--ui-primary) 55%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
}
</style>
