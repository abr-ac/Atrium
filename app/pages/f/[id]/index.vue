<script setup lang="ts">
// Forum detail — shows the categories under this forum space.

const route = useRoute();
const { doc } = useAbracadabra();

const forumId = computed(() => route.params.id as string);
const tree = useChildTree(doc, forumId.value);

const self = computed(() =>
  tree.entries.value.find((e) => e.id === forumId.value),
);
const categories = computed(() =>
  tree.childrenOf(null).filter((c) => c.type === "category"),
);

useHead(() => ({
  title: `${self.value?.label ?? "Forum"} · Atrium`,
}));
</script>

<template>
  <div class="atrium-page">
    <header class="atrium-page__head">
      <div class="flex items-center gap-3">
        <UIcon
          :name="`i-lucide-${self?.meta?.icon ?? 'message-square'}`"
          class="size-8 text-primary"
        />
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold leading-tight truncate">
            {{ self?.label ?? "Forum" }}
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

    <UAlert
      v-if="(self?.meta as any)?.banner"
      icon="i-lucide-megaphone"
      color="primary"
      variant="subtle"
      :title="(self?.meta as any)?.banner"
      class="atrium-page__banner"
    />

    <section v-if="categories.length === 0" class="atrium-empty">
      <UIcon name="i-lucide-folder-open" class="size-8 text-dimmed" />
      <p class="text-sm text-dimmed">
        No categories yet.
      </p>
    </section>

    <ul v-else class="atrium-card-grid">
      <li v-for="category in categories" :key="category.id">
        <NuxtLink :to="`/c/${category.id}`" class="atrium-card-link">
          <UCard
            class="h-full transition hover:border-primary/40"
            :ui="{ body: 'flex items-start gap-3 min-w-0' }"
          >
            <UIcon
              :name="`i-lucide-${category.meta?.icon ?? 'folder'}`"
              class="size-5 text-primary mt-0.5 shrink-0"
            />
            <div class="min-w-0 flex-1">
              <p class="font-medium truncate">
                {{ category.label }}
              </p>
              <p
                v-if="(category.meta as any)?.subtitle"
                class="text-xs text-dimmed mt-1 line-clamp-2"
              >
                {{ (category.meta as any)?.subtitle }}
              </p>
            </div>
            <UIcon
              name="i-lucide-chevron-right"
              class="size-4 text-dimmed shrink-0 mt-1"
            />
          </UCard>
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
.atrium-card-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 0.75rem;
}
.atrium-card-link {
  text-decoration: none;
  color: inherit;
  display: block;
  height: 100%;
}
.atrium-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 4rem 1rem;
}
.atrium-page__banner :deep(.q-banner__title),
.atrium-page__banner :deep([data-slot="title"]) {
  white-space: pre-wrap;
  line-height: 1.5;
}
</style>
