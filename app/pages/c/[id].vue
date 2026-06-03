<script setup lang="ts">
// Category detail — shows boards under this category.

const route = useRoute();
const { doc } = useAbracadabra();

const catId = computed(() => route.params.id as string);
const tree = useChildTree(doc, catId.value);

const self = computed(() =>
  tree.entries.value.find((e) => e.id === catId.value),
);
const parentForum = computed(() => {
  const parentId = self.value?.parentId;
  if (!parentId) return null;
  return tree.entries.value.find((e) => e.id === parentId) ?? null;
});
const boards = computed(() =>
  tree.childrenOf(null).filter((b) => b.type === "board"),
);

// Per-board denormalised stats. Until atrium:tally-replies runner lands these
// are computed client-side. Cheap because the whole tree is in-memory.
function statsFor(boardId: string) {
  const threads = tree.entries.value.filter((e) => e.parentId === boardId && e.type === "thread");
  let replyCount = 0;
  let lastActivity = 0;
  for (const t of threads) {
    const replies = tree.entries.value.filter((e) => e.parentId === t.id);
    replyCount += replies.length;
    const tLast = Math.max(t.updatedAt ?? 0, ...replies.map((r) => r.updatedAt ?? 0));
    if (tLast > lastActivity) lastActivity = tLast;
  }
  return { threadCount: threads.length, replyCount, lastActivity };
}

useHead(() => ({
  title: `${self.value?.label ?? "Category"} · Atrium`,
}));
</script>

<template>
  <div class="atrium-page">
    <header class="atrium-page__head">
      <div class="flex items-center gap-3">
        <UIcon
          :name="`i-lucide-${self?.meta?.icon ?? 'folder'}`"
          class="size-7 text-primary"
        />
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold leading-tight truncate">
            {{ self?.label ?? "Category" }}
          </h1>
          <p
            v-if="(self?.meta as any)?.subtitle"
            class="text-sm text-dimmed mt-1"
          >
            {{ (self?.meta as any)?.subtitle }}
          </p>
        </div>
      </div>
    </header>

    <section v-if="boards.length === 0" class="atrium-empty">
      <UIcon name="i-lucide-folder-open" class="size-8 text-dimmed" />
      <p class="text-sm text-dimmed">No boards in this category yet.</p>
    </section>

    <ul v-else class="atrium-board-list">
      <li v-for="board in boards" :key="board.id">
        <NuxtLink :to="`/b/${board.id}`" class="atrium-board-row">
          <UIcon
            :name="`i-lucide-${board.meta?.icon ?? 'message-square-text'}`"
            class="size-5 text-primary mt-0.5 shrink-0"
          />
          <div class="min-w-0 flex-1">
            <p class="font-medium truncate">{{ board.label }}</p>
            <p
              v-if="(board.meta as any)?.subtitle"
              class="text-xs text-dimmed mt-0.5 line-clamp-2"
            >
              {{ (board.meta as any)?.subtitle }}
            </p>
          </div>
          <div class="atrium-board-row__stats shrink-0">
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ statsFor(board.id).threadCount }} thread<template
                v-if="statsFor(board.id).threadCount !== 1"
                >s</template
              >
            </UBadge>
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ statsFor(board.id).replyCount }} repl<template
                v-if="statsFor(board.id).replyCount === 1"
                >y</template
              ><template v-else>ies</template>
            </UBadge>
          </div>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 text-dimmed shrink-0 mt-1"
          />
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.atrium-page {
  height: 100%;
  overflow-y: auto;
  padding: 1.5rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.atrium-page__head {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.atrium-page__back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8125rem;
  color: var(--ui-text-dimmed);
  text-decoration: none;
  width: fit-content;
}
.atrium-page__back:hover {
  color: var(--ui-text-highlighted);
}
.atrium-board-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.atrium-board-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  text-decoration: none;
  color: inherit;
  background: var(--ui-bg);
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}
.atrium-board-row:hover {
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-primary) 3%, var(--ui-bg));
}
.atrium-board-row__stats {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.1rem;
}
.atrium-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 4rem 1rem;
}
</style>
