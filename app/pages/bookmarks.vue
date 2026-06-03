<script setup lang="ts">
// Bookmarks page — lists everything the user has saved-for-later on this
// device. v0 reads from localStorage (R45 promotes to a per-user doc).

const { all, count, unbookmark } = useAtriumBookmarks();
const toast = useToast();

useHead({ title: "Bookmarks · Atrium" });

function relative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function remove(id: string, label?: string) {
  unbookmark(id);
  toast.add({
    title: "Bookmark removed",
    description: label ?? "",
    icon: "i-lucide-bookmark",
  });
}
</script>

<template>
  <div class="atrium-bookmarks">
    <header class="atrium-bookmarks__head">
      <UIcon name="i-lucide-bookmark" class="size-7 text-primary" />
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold leading-tight">Bookmarks</h1>
        <p class="text-sm text-dimmed mt-1">
          Private to this device — saved threads and replies you want to come back to.
          <span v-if="count" class="text-default font-medium">{{ count }}</span>
        </p>
      </div>
    </header>

    <ClientOnly>
      <section v-if="!all.length" class="atrium-bookmarks__empty">
        <UIcon name="i-lucide-bookmark-plus" class="size-8 text-dimmed" />
        <p class="atrium-bookmarks__empty-title">No bookmarks yet</p>
        <p class="atrium-bookmarks__empty-sub">
          Tap the bookmark icon under any post to save it for later.
        </p>
      </section>

      <ul v-else class="atrium-bookmarks__list">
        <li v-for="b in all" :key="b.id">
          <div class="atrium-bookmarks__row">
            <NuxtLink :to="b.href ?? '/'" class="atrium-bookmarks__row-body">
              <p class="atrium-bookmarks__row-title truncate">
                {{ b.label || "(saved post)" }}
              </p>
              <p v-if="b.snippet" class="atrium-bookmarks__row-snippet">
                {{ b.snippet }}
              </p>
              <p class="atrium-bookmarks__row-meta">
                <span v-if="b.threadLabel" class="truncate">{{ b.threadLabel }}</span>
                <span v-if="b.threadLabel" class="atrium-bookmarks__row-dot">·</span>
                <span>saved {{ relative(b.savedAt) }}</span>
              </p>
            </NuxtLink>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="xs"
              :aria-label="'Remove bookmark'"
              @click="remove(b.id, b.label)"
            />
          </div>
        </li>
      </ul>

      <template #fallback>
        <div class="atrium-bookmarks__loading">
          <UIcon name="i-lucide-loader-circle" class="size-5 text-dimmed animate-spin" />
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.atrium-bookmarks {
  max-width: 56rem;
  margin: 0 auto;
  width: 100%;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.atrium-bookmarks__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.atrium-bookmarks__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-md, 0.65rem);
  overflow: hidden;
  background: var(--ui-bg);
}
.atrium-bookmarks__list li + li .atrium-bookmarks__row {
  border-top: 1px solid var(--ui-border);
}
.atrium-bookmarks__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  transition: background 0.15s ease;
}
.atrium-bookmarks__row:hover {
  background: color-mix(in srgb, var(--ui-primary) 5%, transparent);
}
.atrium-bookmarks__row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-decoration: none;
  color: inherit;
}
.atrium-bookmarks__row-title {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0;
}
.atrium-bookmarks__row-snippet {
  font-size: 0.825rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.atrium-bookmarks__row-meta {
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
.atrium-bookmarks__row-dot { opacity: 0.5; }
.atrium-bookmarks__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding: 3rem 1rem;
  border: 1px dashed var(--ui-border);
  border-radius: var(--atrium-radius-lg, 1rem);
  text-align: center;
}
.atrium-bookmarks__empty-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}
.atrium-bookmarks__empty-sub {
  font-size: 0.825rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  max-width: 32rem;
  line-height: 1.5;
}
.atrium-bookmarks__loading {
  display: flex;
  justify-content: center;
  padding: 4rem;
}
</style>
