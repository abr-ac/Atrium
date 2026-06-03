<script setup lang="ts">
// AtriumPostAttachments — renders tree-attached blocks (polls today, more
// later) that hang directly under a post entry. Reuses the same useChildTree
// instance the parent page already created so we don't re-subscribe per post.

import type { TreeEntry } from "#imports";

const props = defineProps<{
  postId: string;
  tree: ReturnType<typeof useChildTree>;
}>();

const polls = computed<TreeEntry[]>(() =>
  props.tree.entries.value
    .filter((e) => e.parentId === props.postId && e.type === "poll")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
);
</script>

<template>
  <div v-if="polls.length" class="atrium-attach">
    <AtriumPoll v-for="p in polls" :key="p.id" :poll-id="p.id" />
  </div>
</template>

<style scoped>
.atrium-attach {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
