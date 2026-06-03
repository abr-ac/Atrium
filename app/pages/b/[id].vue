<script setup lang="ts">
// Board detail — list of threads, sorted with pinned first then by recency.

const route = useRoute();
const { doc } = useAbracadabra();

const boardId = computed(() => route.params.id as string);
const tree = useChildTree(doc, boardId.value);

const self = computed(() =>
  tree.entries.value.find((e) => e.id === boardId.value),
);
const parentCategory = computed(() => {
  const pid = self.value?.parentId;
  if (!pid) return null;
  return tree.entries.value.find((e) => e.id === pid) ?? null;
});

interface ThreadRow {
  id: string;
  label: string;
  subtitle: string;
  tags: string[];
  priority: number;
  status: string;
  replyCount: number;
  lastActivity: number;
}

const { publicKeyB64 } = useAbracadabra();

const threads = computed<ThreadRow[]>(() => {
  const raw = tree
    .childrenOf(null)
    .filter((t) => {
      if (t.type !== "thread") return false;
      // Hide other authors' drafts; drafts are author-only until published.
      const meta = (t.meta ?? {}) as Record<string, unknown>;
      if (meta.draft && meta.author !== publicKeyB64.value) return false;
      // Also hide my own drafts from the public list — the inline composer
      // owns its own draft surface.
      if (meta.draft) return false;
      return true;
    });
  return raw
    .map((t) => {
      const meta = (t.meta ?? {}) as Record<string, unknown>;
      const replies = tree.entries.value.filter((e) => {
        if (e.parentId !== t.id) return false;
        if (e.type === "reaction") return false;
        const m = (e.meta ?? {}) as Record<string, unknown>;
        if (m.draft) return false;
        return true;
      });
      return {
        id: t.id,
        label: t.label,
        subtitle: (meta.subtitle as string) ?? "",
        tags: (meta.tags as string[]) ?? [],
        priority: (meta.priority as number) ?? 0,
        status: (meta.status as string) ?? "",
        replyCount: replies.length,
        lastActivity: Math.max(
          t.updatedAt ?? 0,
          ...replies.map((r) => r.updatedAt ?? 0),
        ),
      };
    })
    .sort((a, b) => {
      // Pinned (priority=4) always on top.
      const aPin = a.priority >= 4 ? 1 : 0;
      const bPin = b.priority >= 4 ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return b.lastActivity - a.lastActivity;
    });
});

function relativeTime(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
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
const toast = useToast();
const reads = useAtriumReads();

function onThreadCreated(id: string) {
  router.push(`/t/${id}`);
}

// Right-click context menu for each thread row. Pin / lock / resolve / copy
// link / delete. Each item patches the tree entry's meta directly.
function contextItemsFor(thread: ThreadRow) {
  const isPinned = thread.priority >= 4;
  const isResolved = thread.status === "resolved";
  const isLocked = thread.priority >= 0
    && Boolean((tree.entries.value.find((e) => e.id === thread.id)?.meta as any)?.locked);
  return [
    [
      {
        label: isPinned ? "Unpin thread" : "Pin to top",
        icon: isPinned ? "i-lucide-pin-off" : "i-lucide-pin",
        onSelect() {
          tree.updateMeta(thread.id, {
            priority: isPinned ? 0 : 4,
          } as Record<string, unknown>);
        },
      },
      {
        label: isLocked ? "Unlock thread" : "Lock thread",
        icon: isLocked ? "i-lucide-unlock" : "i-lucide-lock",
        onSelect() {
          tree.updateMeta(thread.id, {
            locked: !isLocked,
          } as Record<string, unknown>);
        },
      },
      {
        label: isResolved ? "Reopen" : "Mark resolved",
        icon: isResolved ? "i-lucide-rotate-ccw" : "i-lucide-check-circle-2",
        onSelect() {
          tree.updateMeta(thread.id, {
            status: isResolved ? "open" : "resolved",
          } as Record<string, unknown>);
        },
      },
    ],
    [
      {
        label: "Copy link",
        icon: "i-lucide-link",
        onSelect() {
          if (typeof window === "undefined") return;
          const url = `${window.location.origin}/t/${thread.id}`;
          navigator.clipboard.writeText(url).then(() => {
            toast.add({ title: "Link copied", description: url, icon: "i-lucide-link" });
          }).catch(() => {});
        },
      },
    ],
  ];
}

// Topbar's create menu lands here with ?compose=1 to auto-open the composer.
const autoExpand = computed(() => route.query.compose === "1");

useHead(() => ({
  title: `${self.value?.label ?? "Board"} · Atrium`,
}));
</script>

<template>
  <div class="atrium-page">
    <header class="atrium-page__head">
      <div class="flex items-start gap-3">
        <UIcon
          :name="`i-lucide-${self?.meta?.icon ?? 'message-square-text'}`"
          class="size-7 text-primary mt-1 shrink-0"
        />
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-semibold leading-tight truncate">
            {{ self?.label ?? "Board" }}
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

    <ClientOnly>
      <NewThreadComposer
        :board-id="boardId"
        :board-label="self?.label ?? 'Board'"
        :auto-expand="autoExpand"
        @created="onThreadCreated"
      />
    </ClientOnly>

    <section v-if="threads.length === 0" class="atrium-empty">
      <UIcon name="i-lucide-message-square-dashed" class="size-10 text-dimmed" />
      <p class="atrium-empty__title">No threads yet</p>
      <p class="atrium-empty__sub">
        Start the conversation — your first thread becomes the seed for everything
        else in <strong>#{{ self?.label ?? "this board" }}</strong>.
      </p>
    </section>

    <ul v-else class="atrium-thread-list">
      <li v-for="thread in threads" :key="thread.id">
        <UContextMenu :items="contextItemsFor(thread)">
          <NuxtLink
            :to="`/t/${thread.id}`"
            class="atrium-thread-row"
            :class="{ 'atrium-thread-row--unread': reads.isUnread(thread.id, thread.lastActivity) }"
          >
          <UIcon
            :name="
              thread.priority >= 4
                ? 'i-lucide-pin'
                : thread.status === 'resolved'
                  ? 'i-lucide-check-circle-2'
                  : 'i-lucide-message-circle'
            "
            class="size-4 mt-1 shrink-0"
            :class="
              thread.priority >= 4
                ? 'text-primary'
                : thread.status === 'resolved'
                  ? 'text-success'
                  : 'text-dimmed'
            "
          />
          <span
            v-if="reads.isUnread(thread.id, thread.lastActivity)"
            class="atrium-thread-row__unread-dot"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <p class="atrium-thread-row__title">
              <span class="truncate">{{ thread.label }}</span>
              <UBadge
                v-for="tag in thread.tags"
                :key="tag"
                color="neutral"
                variant="subtle"
                size="sm"
                class="atrium-thread-row__tag"
              >
                {{ tag }}
              </UBadge>
            </p>
            <p v-if="thread.subtitle" class="atrium-thread-row__sub">
              {{ thread.subtitle }}
            </p>
          </div>
          <div class="atrium-thread-row__meta shrink-0">
            <UBadge color="neutral" variant="subtle" size="sm">
              <UIcon name="i-lucide-message-circle" class="size-3 mr-0.5" />
              {{ thread.replyCount }}
            </UBadge>
            <span class="text-xs text-dimmed">
              {{ relativeTime(thread.lastActivity) }}
            </span>
          </div>
          </NuxtLink>
        </UContextMenu>
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
.atrium-thread-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  overflow: hidden;
  background: var(--ui-bg);
}
.atrium-thread-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid var(--ui-border);
  transition: background 0.15s ease;
}
.atrium-thread-list li:last-child .atrium-thread-row {
  border-bottom: none;
}
.atrium-thread-row:hover {
  background: color-mix(in srgb, var(--ui-primary) 3%, var(--ui-bg));
}
.atrium-thread-row__title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 500;
  font-size: 0.95rem;
  margin: 0;
  min-width: 0;
}
.atrium-thread-row--unread .atrium-thread-row__title {
  font-weight: 700;
  color: var(--ui-text);
}
.atrium-thread-row--unread .atrium-thread-row__sub {
  color: var(--ui-text);
}
.atrium-thread-row__unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--ui-primary);
  flex-shrink: 0;
  margin: 0.5rem 0 0;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 30%, transparent);
}
.atrium-thread-row__tag {
  flex-shrink: 0;
}
.atrium-thread-row__sub {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--ui-text-dimmed);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.atrium-thread-row__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  min-width: 6rem;
}
.atrium-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding: 3.5rem 1rem;
  border: 1px dashed var(--ui-border);
  border-radius: var(--atrium-radius-lg, 1rem);
  text-align: center;
}
.atrium-empty__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
.atrium-empty__sub {
  font-size: 0.875rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  max-width: 28rem;
  line-height: 1.5;
}
</style>
