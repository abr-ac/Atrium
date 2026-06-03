<script setup lang="ts">
// Inbox — live notification feed driven by useNotifications(). Filters,
// grouped time buckets, read state, and a "mark all read" action.

import type { AppNotification, NotificationType } from "@abraca/nuxt";

useHead({ title: "Inbox · Atrium" });

const { notifications, unreadCount, fetchNotifications, markRead, markAllRead }
  = useNotifications();

onMounted(() => {
  fetchNotifications({ limit: 100 });
});

type Filter = "all" | "following" | "mention" | "chat" | "system";

const filter = ref<Filter>("all");
const follows = useAtriumFollows();

const FILTERS: Array<{ id: Filter; label: string; icon: string }> = [
  { id: "all", label: "All", icon: "i-lucide-inbox" },
  { id: "following", label: "Following", icon: "i-lucide-heart" },
  { id: "mention", label: "Mentions", icon: "i-lucide-at-sign" },
  { id: "chat", label: "Replies", icon: "i-lucide-message-circle" },
  { id: "system", label: "System", icon: "i-lucide-info" },
];

function followedThreadFromLink(link?: string): string | null {
  if (!link) return null;
  const m = link.match(/^\/t\/([^/?#]+)/);
  return m ? m[1]! : null;
}

function matchesFilter(n: AppNotification, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "following") {
    const id = followedThreadFromLink(n.link);
    return id ? follows.isFollowing(id) : false;
  }
  if (f === "mention") return n.type === "mention";
  if (f === "chat") return n.type === "chat" || n.type === "agent";
  if (f === "system") return n.type === "system";
  return true;
}

const filtered = computed(() =>
  notifications.value
    .filter((n) => matchesFilter(n, filter.value))
    .sort((a, b) => b.createdAt - a.createdAt),
);

const countsByFilter = computed(() => {
  const out: Record<Filter, number> = { all: 0, following: 0, mention: 0, chat: 0, system: 0 };
  for (const n of notifications.value) {
    if (n.read) continue;
    out.all += 1;
    if (n.type === "mention") out.mention += 1;
    if (n.type === "chat" || n.type === "agent") out.chat += 1;
    if (n.type === "system") out.system += 1;
    const id = followedThreadFromLink(n.link);
    if (id && follows.isFollowing(id)) out.following += 1;
  }
  return out;
});

interface Bucket {
  id: string;
  label: string;
  items: AppNotification[];
}

function dayKey(ts: number): { id: string; label: string; order: number } {
  const now = new Date();
  const d = new Date(ts);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
  if (sameDay(now, d)) return { id: "today", label: "Today", order: 0 };
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(y, d)) return { id: "yesterday", label: "Yesterday", order: 1 };
  const diffDays = Math.floor((now.getTime() - ts) / 86400_000);
  if (diffDays < 7) return { id: "week", label: "Earlier this week", order: 2 };
  if (diffDays < 30) return { id: "month", label: "Earlier this month", order: 3 };
  return { id: "older", label: "Older", order: 4 };
}

const buckets = computed<Bucket[]>(() => {
  const out = new Map<string, { label: string; items: AppNotification[]; order: number }>();
  for (const n of filtered.value) {
    const k = dayKey(n.createdAt);
    if (!out.has(k.id)) out.set(k.id, { label: k.label, items: [], order: k.order });
    out.get(k.id)!.items.push(n);
  }
  return [...out.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id, v]) => ({ id, label: v.label, items: v.items }));
});

function iconFor(type: NotificationType): string {
  switch (type) {
    case "mention": return "i-lucide-at-sign";
    case "chat": return "i-lucide-message-circle";
    case "agent": return "i-lucide-bot";
    default: return "i-lucide-bell";
  }
}

function colorFor(type: NotificationType): "primary" | "neutral" | "success" {
  if (type === "mention") return "primary";
  if (type === "chat" || type === "agent") return "success";
  return "neutral";
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

const router = useRouter();

function activate(n: AppNotification) {
  if (!n.read) markRead(n.id);
  if (n.link) router.push(n.link);
}
</script>

<template>
  <div class="atrium-inbox">
    <header class="atrium-inbox__head">
      <div class="atrium-inbox__head-row">
        <UIcon name="i-lucide-inbox" class="size-7 text-primary" />
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-semibold leading-tight">Inbox</h1>
          <p class="text-sm text-dimmed mt-1">
            <template v-if="unreadCount > 0">
              {{ unreadCount }} unread {{ unreadCount === 1 ? "notification" : "notifications" }}.
            </template>
            <template v-else>
              You're all caught up.
            </template>
          </p>
        </div>
        <UButton
          v-if="unreadCount > 0"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-check-check"
          @click="markAllRead"
        >
          Mark all read
        </UButton>
      </div>
      <nav class="atrium-inbox__filters">
        <button
          v-for="f in FILTERS"
          :key="f.id"
          type="button"
          class="atrium-inbox__filter"
          :class="{ 'atrium-inbox__filter--active': filter === f.id }"
          @click="filter = f.id"
        >
          <UIcon :name="f.icon" class="size-3.5" />
          <span>{{ f.label }}</span>
          <UBadge
            v-if="countsByFilter[f.id] > 0"
            color="primary"
            variant="subtle"
            size="sm"
            class="atrium-inbox__filter-count"
          >
            {{ countsByFilter[f.id] }}
          </UBadge>
        </button>
      </nav>
    </header>

    <section v-if="buckets.length === 0" class="atrium-inbox__empty">
      <UIcon name="i-lucide-mail-check" class="size-10 text-dimmed" />
      <p class="atrium-inbox__empty-title">Nothing here</p>
      <p class="atrium-inbox__empty-sub">
        <template v-if="filter !== 'all'">
          No notifications match this filter. Try
          <button class="atrium-inbox__empty-link" @click="filter = 'all'">
            "All"
          </button>.
        </template>
        <template v-else>
          When someone replies, reacts, or mentions you — it'll land here.
        </template>
      </p>
    </section>

    <section
      v-for="bucket in buckets"
      :key="bucket.id"
      class="atrium-inbox__bucket"
    >
      <header class="atrium-inbox__bucket-head">
        <span>{{ bucket.label }}</span>
        <span class="atrium-inbox__bucket-count">
          {{ bucket.items.length }}
        </span>
      </header>
      <ul class="atrium-inbox__list">
        <li
          v-for="n in bucket.items"
          :key="n.id"
          class="atrium-inbox__row"
          :class="{ 'atrium-inbox__row--unread': !n.read }"
        >
          <button
            type="button"
            class="atrium-inbox__row-btn"
            @click="activate(n)"
          >
            <span class="atrium-inbox__row-icon">
              <UIcon
                :name="n.icon ?? iconFor(n.type)"
                class="size-4"
                :class="`text-${colorFor(n.type)}`"
              />
            </span>
            <div class="atrium-inbox__row-body">
              <p class="atrium-inbox__row-title">
                <span class="truncate">{{ n.title || "Notification" }}</span>
                <UBadge
                  :color="colorFor(n.type)"
                  variant="subtle"
                  size="sm"
                  class="atrium-inbox__row-type"
                >
                  {{ n.type }}
                </UBadge>
              </p>
              <p v-if="n.body" class="atrium-inbox__row-text">
                {{ n.body }}
              </p>
            </div>
            <div class="atrium-inbox__row-meta">
              <span class="atrium-inbox__row-time">
                {{ relativeTime(n.createdAt) }}
              </span>
              <span v-if="!n.read" class="atrium-inbox__row-dot" aria-hidden="true" />
              <UIcon
                v-if="n.link"
                name="i-lucide-arrow-up-right"
                class="size-3.5 text-dimmed"
              />
            </div>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.atrium-inbox {
  height: 100%;
  overflow-y: auto;
  padding: 1.5rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 56rem;
  margin: 0 auto;
  width: 100%;
}
.atrium-inbox__head {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.atrium-inbox__head-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.atrium-inbox__filters {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.6rem;
  background: var(--ui-bg-elevated);
  align-self: flex-start;
  flex-wrap: wrap;
}
.atrium-inbox__filter {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border: none;
  background: transparent;
  border-radius: 0.4rem;
  color: var(--ui-text-dimmed);
  font-size: 0.825rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.atrium-inbox__filter:hover {
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
  color: var(--ui-text);
}
.atrium-inbox__filter--active {
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
  color: var(--ui-primary);
}
.atrium-inbox__filter-count {
  margin-left: 0.15rem;
}
.atrium-inbox__bucket {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.atrium-inbox__bucket-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
  padding: 0 0.25rem;
}
.atrium-inbox__bucket-count {
  color: var(--ui-text-dimmed);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  font-size: 0.7rem;
}
.atrium-inbox__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 0.6rem;
  overflow: hidden;
  background: var(--ui-bg);
}
.atrium-inbox__row + .atrium-inbox__row {
  border-top: 1px solid var(--ui-border);
}
.atrium-inbox__row--unread {
  background: color-mix(in srgb, var(--ui-primary) 4%, transparent);
}
.atrium-inbox__row-btn {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}
.atrium-inbox__row-btn:hover {
  background: color-mix(in srgb, var(--ui-primary) 6%, transparent);
}
.atrium-inbox__row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--ui-text-dimmed) 8%, transparent);
  flex-shrink: 0;
  margin-top: 0.1rem;
}
.atrium-inbox__row--unread .atrium-inbox__row-icon {
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
}
.atrium-inbox__row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.atrium-inbox__row-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 500;
  margin: 0;
  min-width: 0;
}
.atrium-inbox__row--unread .atrium-inbox__row-title {
  font-weight: 600;
}
.atrium-inbox__row-type {
  flex-shrink: 0;
  text-transform: capitalize;
}
.atrium-inbox__row-text {
  font-size: 0.8125rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.atrium-inbox__row-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  margin-top: 0.1rem;
}
.atrium-inbox__row-time {
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  font-variant-numeric: tabular-nums;
}
.atrium-inbox__row-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--ui-primary);
}
.atrium-inbox__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 3rem 1rem;
  border: 1px dashed var(--ui-border);
  border-radius: 0.75rem;
  text-align: center;
}
.atrium-inbox__empty-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}
.atrium-inbox__empty-sub {
  font-size: 0.825rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  max-width: 28rem;
}
.atrium-inbox__empty-link {
  background: none;
  border: none;
  padding: 0;
  color: var(--ui-primary);
  cursor: pointer;
  font: inherit;
}
.atrium-inbox__empty-link:hover {
  text-decoration: underline;
}
</style>
