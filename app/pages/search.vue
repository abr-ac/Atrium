<script setup lang="ts">
// Search results page — `/search?q=…` runs the search composable against
// the loaded doc tree and renders ranked hits with snippets.

const route = useRoute();
const router = useRouter();
const { search } = useAtriumSearch();
const nav = useAtriumNav();

const queryInput = ref(((route.query.q as string) ?? "").trim());
const debouncedQuery = ref(queryInput.value);
const scope = ref<"this" | "all">(
  ((route.query.scope as string) === "all" ? "all" : "this") as "this" | "all",
);

const activeForumId = computed(() => nav.trail.value.forum?.id ?? null);
const activeForumLabel = computed(() => nav.trail.value.forum?.label ?? null);

function updateUrl() {
  const next: Record<string, string> = {};
  if (debouncedQuery.value) next.q = debouncedQuery.value;
  if (scope.value === "all") next.scope = "all";
  router.replace({ query: next });
}

let debounce: ReturnType<typeof setTimeout> | null = null;
watch(queryInput, (v) => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debouncedQuery.value = v.trim();
    updateUrl();
  }, 180);
});

watch(scope, () => updateUrl());

const hits = computed(() =>
  debouncedQuery.value
    ? search(debouncedQuery.value, {
      scope: scope.value,
      activeForumId: activeForumId.value,
      limit: 80,
    })
    : [],
);

const scopeItems = computed(() => [
  {
    label: activeForumLabel.value
      ? `This forum · ${activeForumLabel.value}`
      : "This forum",
    value: "this",
  },
  { label: "All forums", value: "all" },
]);

useHead(() => ({
  title: debouncedQuery.value
    ? `Search · ${debouncedQuery.value} · Atrium`
    : "Search · Atrium",
}));

function typeLabel(t: string) {
  switch (t) {
    case "thread": return "Thread";
    case "board": return "Board";
    case "category": return "Category";
    case "forum": return "Forum";
    case "voice-room": return "Voice room";
    default: return "Reply";
  }
}

function typeIcon(t: string) {
  switch (t) {
    case "thread": return "i-lucide-message-square-text";
    case "board": return "i-lucide-hash";
    case "category": return "i-lucide-folder";
    case "forum": return "i-lucide-message-square";
    case "voice-room": return "i-lucide-radio";
    default: return "i-lucide-corner-down-right";
  }
}
</script>

<template>
  <div class="atrium-search">
    <header class="atrium-search__head">
      <UIcon name="i-lucide-search" class="size-7 text-primary" />
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold leading-tight">Search</h1>
        <p class="text-sm text-dimmed mt-1">
          <template v-if="scope === 'all'">
            Scanning every thread title and post body across all loaded forums.
          </template>
          <template v-else>
            Scanning every thread title and post body in the active forum.
          </template>
        </p>
      </div>
    </header>

    <div class="atrium-search__controls">
      <UInput
        v-model="queryInput"
        size="xl"
        icon="i-lucide-search"
        placeholder="Search threads, replies, boards…"
        autofocus
        class="flex-1"
      />
      <USelect
        v-model="scope"
        :items="scopeItems"
        size="xl"
        class="atrium-search__scope"
      />
    </div>

    <ClientOnly>
      <section v-if="!debouncedQuery" class="atrium-search__empty">
        <UIcon name="i-lucide-keyboard" class="size-8 text-dimmed" />
        <p class="atrium-search__empty-title">Type to search</p>
        <p class="atrium-search__empty-sub">
          Hits include thread titles, post bodies, and subtitles. Multiple
          terms = AND. Earliest matches rank higher.
        </p>
      </section>

      <section v-else-if="hits.length === 0" class="atrium-search__empty">
        <UIcon name="i-lucide-search-x" class="size-8 text-dimmed" />
        <p class="atrium-search__empty-title">No results</p>
        <p class="atrium-search__empty-sub">
          Nothing matched <strong>"{{ debouncedQuery }}"</strong>. Try fewer
          terms, or expand the loaded forums by clicking around the rail.
        </p>
      </section>

      <ul v-else class="atrium-search__list">
        <li v-for="h in hits" :key="h.id">
          <NuxtLink :to="h.href" class="atrium-search__row">
            <span class="atrium-search__row-icon">
              <UIcon :name="typeIcon(h.type)" class="size-4" />
            </span>
            <div class="atrium-search__row-body">
              <p class="atrium-search__row-title">
                <span class="truncate">{{ h.label }}</span>
                <UBadge color="neutral" variant="subtle" size="sm">
                  {{ typeLabel(h.type) }}
                </UBadge>
              </p>
              <p class="atrium-search__row-snippet">
                {{ h.snippet }}
              </p>
              <p v-if="h.boardLabel || h.threadLabel || h.forumLabel" class="atrium-search__row-meta">
                <span v-if="h.forumLabel && scope === 'all'" class="atrium-search__row-forum">
                  <UIcon
                    :name="`i-lucide-${h.forumIcon ?? 'message-square'}`"
                    class="size-3"
                  />
                  {{ h.forumLabel }}
                </span>
                <span v-if="h.forumLabel && scope === 'all' && h.boardLabel" class="atrium-search__row-dot">·</span>
                <span v-if="h.boardLabel">#{{ h.boardLabel }}</span>
                <span v-if="h.boardLabel && h.threadLabel && h.type !== 'thread'" class="atrium-search__row-dot">·</span>
                <span v-if="h.threadLabel && h.type !== 'thread'" class="truncate">
                  in {{ h.threadLabel }}
                </span>
              </p>
            </div>
            <UIcon name="i-lucide-arrow-up-right" class="size-3.5 text-dimmed" />
          </NuxtLink>
        </li>
      </ul>

      <template #fallback>
        <div class="atrium-search__loading">
          <UIcon name="i-lucide-loader-circle" class="size-5 text-dimmed animate-spin" />
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.atrium-search {
  max-width: 56rem;
  margin: 0 auto;
  width: 100%;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.atrium-search__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.atrium-search__controls {
  display: flex;
  gap: 0.6rem;
  align-items: stretch;
}
.atrium-search__scope {
  min-width: 12rem;
}
.atrium-search__row-forum {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.05rem 0.35rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ui-primary) 12%, transparent);
  color: var(--ui-primary);
  font-weight: 500;
}
.atrium-search__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-md, 0.65rem);
  overflow: hidden;
  background: var(--ui-bg);
}
.atrium-search__list li + li .atrium-search__row {
  border-top: 1px solid var(--ui-border);
}
.atrium-search__row {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  text-decoration: none;
  color: inherit;
  transition: background 0.15s ease;
}
.atrium-search__row:hover {
  background: color-mix(in srgb, var(--ui-primary) 5%, transparent);
}
.atrium-search__row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--atrium-radius-sm, 0.4rem);
  background: color-mix(in srgb, var(--ui-text-dimmed) 8%, transparent);
  color: var(--ui-text-dimmed);
  flex-shrink: 0;
  margin-top: 0.1rem;
}
.atrium-search__row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.atrium-search__row-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0;
  min-width: 0;
}
.atrium-search__row-snippet {
  font-size: 0.825rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.atrium-search__row-meta {
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
.atrium-search__row-dot { opacity: 0.5; }
.atrium-search__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding: 3rem 1rem;
  border: 1px dashed var(--ui-border);
  border-radius: var(--atrium-radius-lg, 1rem);
  text-align: center;
}
.atrium-search__empty-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}
.atrium-search__empty-sub {
  font-size: 0.825rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  max-width: 32rem;
  line-height: 1.5;
}
.atrium-search__loading {
  display: flex;
  justify-content: center;
  padding: 4rem;
}
</style>
