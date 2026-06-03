<script setup lang="ts">
// Landing — hero with the primary forum CTA + recent-activity rail. The mini
// rail and sidebar handle forum switching, so the landing's job is to
// onboard new visitors and give returning ones a one-tap entry into the
// place they last cared about.

useHead({ title: "Atrium" });

const nav = useAtriumNav();
const { status, publicKeyB64 } = useAbracadabra();

const primaryForum = computed(() => nav.forums.value[0] ?? null);
const ready = computed(() => status.value === "connected");

interface RecentEntry {
  threadId: string;
  threadLabel: string;
  boardLabel: string;
  boardId: string;
  lastActivity: number;
  replyCount: number;
}

const recent = computed<RecentEntry[]>(() => {
  if (!primaryForum.value) return [];
  const cats = nav.categoriesForForum(primaryForum.value.id);
  const out: RecentEntry[] = [];
  for (const cat of cats) {
    for (const board of nav.boardsForCategory(cat.id)) {
      for (const thread of nav.threadsForBoard(board.id)) {
        const replies = nav.repliesForThread(thread.id);
        const lastActivity = Math.max(
          thread.updatedAt ?? 0,
          ...replies.map((r) => r.updatedAt ?? 0),
        );
        out.push({
          threadId: thread.id,
          threadLabel: thread.label,
          boardLabel: board.label,
          boardId: board.id,
          lastActivity,
          replyCount: replies.length,
        });
      }
    }
  }
  return out
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, 6);
});

function relativeTime(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

const forumStats = computed(() => {
  if (!primaryForum.value) return { boards: 0, threads: 0, posts: 0 };
  const cats = nav.categoriesForForum(primaryForum.value.id);
  let boards = 0;
  let threads = 0;
  let posts = 0;
  for (const cat of cats) {
    for (const board of nav.boardsForCategory(cat.id)) {
      boards += 1;
      const list = nav.threadsForBoard(board.id);
      threads += list.length;
      for (const t of list) {
        posts += 1 + nav.repliesForThread(t.id).length;
      }
    }
  }
  return { boards, threads, posts };
});
</script>

<template>
  <div class="atrium-landing">
    <ClientOnly>
      <section class="atrium-landing__hero">
        <div class="atrium-landing__hero-inner">
          <div class="atrium-landing__hero-glow" aria-hidden="true" />
          <UBadge
            color="primary"
            variant="subtle"
            size="sm"
            class="atrium-landing__hero-eyebrow"
          >
            <UIcon name="i-lucide-sparkles" class="size-3" />
            Realtime forums on Abracadabra
          </UBadge>
          <h1 class="atrium-landing__hero-title">
            Where the conversation never gets stale.
          </h1>
          <p class="atrium-landing__hero-sub">
            Long-form threads with the immediacy of chat. Every post propagates
            instantly to everyone watching — reactions, edits, mod actions, all
            live, all conflict-free.
          </p>

          <div class="atrium-landing__hero-cta">
            <UButton
              v-if="primaryForum"
              :to="`/f/${primaryForum.id}`"
              color="primary"
              size="lg"
              :trailing-icon="'i-lucide-arrow-right'"
            >
              Enter {{ primaryForum.label }}
            </UButton>
            <UButton
              v-else
              color="primary"
              variant="soft"
              size="lg"
              :loading="!ready"
              disabled
            >
              Waiting for the seed forum…
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="lg"
              :trailing-icon="'i-lucide-keyboard'"
              @click="$el.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))"
            >
              Search · ⌘K
            </UButton>
          </div>

          <dl class="atrium-landing__hero-stats">
            <div>
              <dt>Boards</dt>
              <dd>{{ forumStats.boards }}</dd>
            </div>
            <div>
              <dt>Threads</dt>
              <dd>{{ forumStats.threads }}</dd>
            </div>
            <div>
              <dt>Posts</dt>
              <dd>{{ forumStats.posts }}</dd>
            </div>
            <div>
              <dt>You</dt>
              <dd class="atrium-landing__hero-id">
                {{ publicKeyB64.slice(0, 6) }}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section class="atrium-landing__row">
        <header class="atrium-landing__row-head">
          <UIcon name="i-lucide-history" class="size-4 text-primary" />
          <h2 class="atrium-landing__row-title">Latest activity</h2>
          <NuxtLink
            v-if="primaryForum"
            :to="`/f/${primaryForum.id}`"
            class="atrium-landing__row-more"
          >
            Browse all
            <UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
          </NuxtLink>
        </header>
        <ul v-if="recent.length" class="atrium-landing__recent">
          <li v-for="r in recent" :key="r.threadId">
            <NuxtLink :to="`/t/${r.threadId}`" class="atrium-landing__recent-row">
              <div class="atrium-landing__recent-main">
                <p class="atrium-landing__recent-title truncate">
                  {{ r.threadLabel }}
                </p>
                <p class="atrium-landing__recent-meta">
                  <span>#{{ r.boardLabel }}</span>
                  <span class="atrium-landing__recent-dot">·</span>
                  <span>{{ r.replyCount }} {{ r.replyCount === 1 ? 'reply' : 'replies' }}</span>
                  <span class="atrium-landing__recent-dot">·</span>
                  <span>{{ relativeTime(r.lastActivity) }} ago</span>
                </p>
              </div>
              <UIcon
                name="i-lucide-arrow-right"
                class="size-3.5 text-dimmed"
              />
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="atrium-landing__empty">
          No activity yet — be the first to post.
        </p>
      </section>

      <template #fallback>
        <div class="atrium-landing__skeleton" aria-hidden="true">
          <div class="atrium-landing__sk-hero">
            <div class="atrium-landing__sk-eyebrow" />
            <div class="atrium-landing__sk-title-1" />
            <div class="atrium-landing__sk-title-2" />
            <div class="atrium-landing__sk-sub" />
            <div class="atrium-landing__sk-cta-row">
              <div class="atrium-landing__sk-cta" />
              <div class="atrium-landing__sk-cta atrium-landing__sk-cta--ghost" />
            </div>
            <div class="atrium-landing__sk-stats">
              <div /><div /><div /><div />
            </div>
          </div>
          <div class="atrium-landing__sk-row-head" />
          <div class="atrium-landing__sk-recent">
            <div v-for="i in 4" :key="i" class="atrium-landing__sk-row" />
          </div>
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.atrium-landing {
  max-width: 64rem;
  margin: 0 auto;
  padding: 2.5rem 2rem 5rem;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}
.atrium-landing__hero {
  position: relative;
}
.atrium-landing__hero-inner {
  position: relative;
  border: 1px solid var(--ui-border);
  border-radius: 1rem;
  padding: 3rem 2.5rem 2.5rem;
  background:
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--ui-primary) 18%, transparent), transparent 50%),
    radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--ui-primary) 8%, transparent), transparent 55%),
    var(--ui-bg);
  overflow: hidden;
}
.atrium-landing__hero-glow {
  position: absolute;
  inset: -40% -10% auto auto;
  width: 60%;
  height: 80%;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--ui-primary) 20%, transparent),
    transparent
  );
  filter: blur(60px);
  pointer-events: none;
}
.atrium-landing__hero-eyebrow {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 1.4rem;
}
.atrium-landing__hero-title {
  position: relative;
  z-index: 1;
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.025em;
  max-width: 32rem;
  margin: 0 0 0.85rem;
}
.atrium-landing__hero-sub {
  position: relative;
  z-index: 1;
  font-size: 1rem;
  line-height: 1.55;
  color: var(--ui-text-dimmed);
  max-width: 36rem;
  margin: 0 0 1.6rem;
}
.atrium-landing__hero-cta {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 2rem;
}
.atrium-landing__hero-stats {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--ui-border) 60%, transparent);
  padding-top: 1.2rem;
  margin: 0;
  max-width: 32rem;
}
.atrium-landing__hero-stats > div {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.atrium-landing__hero-stats dt {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}
.atrium-landing__hero-stats dd {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.atrium-landing__hero-id {
  font-family: var(--font-mono, ui-monospace);
  font-size: 0.95rem !important;
  font-weight: 500 !important;
  color: var(--ui-text-dimmed);
  word-break: break-all;
}
.atrium-landing__row {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.atrium-landing__row-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.atrium-landing__row-title {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
  margin: 0;
}
.atrium-landing__row-more {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.8125rem;
  color: var(--ui-text-dimmed);
  text-decoration: none;
}
.atrium-landing__row-more:hover {
  color: var(--ui-primary);
}
.atrium-landing__recent {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--ui-bg);
}
.atrium-landing__recent-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid var(--ui-border);
  text-decoration: none;
  color: inherit;
  transition: background 0.15s ease;
}
.atrium-landing__recent li:last-child .atrium-landing__recent-row {
  border-bottom: none;
}
.atrium-landing__recent-row:hover {
  background: color-mix(in srgb, var(--ui-primary) 4%, transparent);
}
.atrium-landing__recent-main {
  flex: 1;
  min-width: 0;
}
.atrium-landing__recent-title {
  font-weight: 500;
  font-size: 0.95rem;
  margin: 0;
}
.atrium-landing__recent-meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--ui-text-dimmed);
  margin: 0.2rem 0 0;
}
.atrium-landing__recent-dot {
  opacity: 0.5;
}
.atrium-landing__empty {
  font-size: 0.875rem;
  color: var(--ui-text-dimmed);
  padding: 1.5rem;
  text-align: center;
  border: 1px dashed var(--ui-border);
  border-radius: 0.75rem;
}
.atrium-landing__hydrating {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 4rem 1rem;
}
.atrium-landing__skeleton {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.atrium-landing__sk-hero,
.atrium-landing__sk-row,
.atrium-landing__sk-recent {
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-lg, 1rem);
  background: var(--ui-bg);
}
.atrium-landing__sk-hero {
  padding: 3rem 2.5rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.atrium-landing__sk-eyebrow {
  width: 11rem;
  height: 1.5rem;
  border-radius: 9999px;
}
.atrium-landing__sk-title-1,
.atrium-landing__sk-title-2 {
  height: 2.1rem;
  border-radius: 0.4rem;
}
.atrium-landing__sk-title-1 { width: 28rem; max-width: 80%; }
.atrium-landing__sk-title-2 { width: 18rem; max-width: 60%; }
.atrium-landing__sk-sub {
  width: 24rem;
  max-width: 80%;
  height: 1.1rem;
  border-radius: 0.4rem;
}
.atrium-landing__sk-cta-row {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.4rem;
}
.atrium-landing__sk-cta {
  width: 11rem;
  height: 2.5rem;
  border-radius: 0.55rem;
}
.atrium-landing__sk-cta--ghost {
  width: 8rem;
}
.atrium-landing__sk-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--ui-border) 60%, transparent);
  padding-top: 1.2rem;
  margin-top: 0.5rem;
}
.atrium-landing__sk-stats > div {
  height: 2.6rem;
  border-radius: 0.4rem;
}
.atrium-landing__sk-row-head {
  width: 9rem;
  height: 0.85rem;
  border-radius: 999px;
}
.atrium-landing__sk-recent {
  padding: 0.4rem 0;
  display: flex;
  flex-direction: column;
}
.atrium-landing__sk-row {
  height: 3.3rem;
  margin: 0.1rem 0.7rem;
  background: transparent;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border) 60%, transparent);
}
.atrium-landing__sk-row:last-child { border-bottom: none; }

/* Shimmer effect across all skeleton boxes. */
.atrium-landing__sk-eyebrow,
.atrium-landing__sk-title-1,
.atrium-landing__sk-title-2,
.atrium-landing__sk-sub,
.atrium-landing__sk-cta,
.atrium-landing__sk-stats > div,
.atrium-landing__sk-row-head,
.atrium-landing__sk-row {
  position: relative;
  background: color-mix(in srgb, var(--ui-text-dimmed) 10%, transparent);
  overflow: hidden;
}
.atrium-landing__sk-eyebrow::after,
.atrium-landing__sk-title-1::after,
.atrium-landing__sk-title-2::after,
.atrium-landing__sk-sub::after,
.atrium-landing__sk-cta::after,
.atrium-landing__sk-stats > div::after,
.atrium-landing__sk-row-head::after,
.atrium-landing__sk-row::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--ui-primary) 8%, transparent) 50%,
    transparent 100%
  );
  animation: atrium-shimmer 1.6s ease-in-out infinite;
}
@keyframes atrium-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
