<script setup lang="ts">
// Drafts surface — every tree entry I authored with meta.draft=true.
// Walks the full atrium tree (via useAtriumNav) and lists drafts grouped
// by board/thread context so I can jump back to wherever I left off.

const abra = useAbracadabra();
const nav = useAtriumNav();
const router = useRouter();
const { doc } = useAbracadabra();
const tree = useChildTree(doc, nav.SERVER_ROOT_ID);

interface DraftRow {
  id: string;
  label: string;
  type: "thread" | "reply" | "other";
  // What it lives under (board for threads, thread for replies)
  parentLabel: string | null;
  parentHref: string | null;
  threadHref: string;
  updatedAt: number;
  body: string;
}

function bodyFrom(meta: Record<string, unknown> | undefined): string {
  if (!meta) return "";
  const raw = (meta.body as string) ?? "";
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const drafts = computed<DraftRow[]>(() => {
  const me = abra.publicKeyB64.value;
  if (!me) return [];
  const out: DraftRow[] = [];
  for (const e of nav.allEntries.value) {
    const meta = (e.meta ?? {}) as Record<string, unknown>;
    if (!meta.draft) continue;
    if (meta.author !== me) continue;
    const parent = e.parentId
      ? nav.allEntries.value.find((p) => p.id === e.parentId) ?? null
      : null;
    let parentLabel: string | null = null;
    let parentHref: string | null = null;
    let threadHref = "/";
    let type: DraftRow["type"] = "other";
    if (e.type === "thread") {
      type = "thread";
      parentLabel = parent ? `#${parent.label}` : null;
      parentHref = parent ? `/b/${parent.id}` : null;
      threadHref = `/t/${e.id}`;
    }
    else if (e.type === "reply") {
      type = "reply";
      // Walk up to the containing thread.
      let cur = parent;
      let safety = 0;
      while (cur && safety++ < 16) {
        if (cur.type === "thread") {
          parentLabel = cur.label;
          parentHref = `/t/${cur.id}`;
          threadHref = `/t/${cur.id}`;
          break;
        }
        if (!cur.parentId) break;
        cur = nav.allEntries.value.find((p) => p.id === cur!.parentId) ?? null;
      }
    }
    out.push({
      id: e.id,
      label: (e.label ?? "(draft)").trim(),
      type,
      parentLabel,
      parentHref,
      threadHref,
      updatedAt: e.updatedAt ?? e.createdAt ?? 0,
      body: bodyFrom(meta).slice(0, 200),
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
});

const groups = computed(() => ({
  threads: drafts.value.filter((d) => d.type === "thread"),
  replies: drafts.value.filter((d) => d.type === "reply"),
  other: drafts.value.filter((d) => d.type === "other"),
}));

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
  return `${Math.floor(d / 30)}mo ago`;
}

function jumpTo(draft: DraftRow) {
  router.push(draft.threadHref);
}

const toast = useToast();
const confirmOpen = ref(false);
const pendingId = ref<string | null>(null);
function askDelete(id: string) {
  pendingId.value = id;
  confirmOpen.value = true;
}
function commitDelete() {
  if (!pendingId.value) return;
  tree.deleteEntry(pendingId.value);
  toast.add({ title: "Draft discarded", icon: "i-lucide-trash-2" });
  confirmOpen.value = false;
  pendingId.value = null;
}

useHead({ title: "Drafts · Atrium" });
</script>

<template>
  <div class="atrium-drafts">
    <header class="atrium-drafts__head">
      <UIcon name="i-lucide-file-pen" class="size-7 text-primary" />
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold leading-tight">Drafts</h1>
        <p class="text-sm text-dimmed mt-1">
          Everything you started but haven't published. Drafts are private to you until posted.
        </p>
      </div>
      <UBadge color="neutral" variant="subtle" size="md">
        {{ drafts.length }}
      </UBadge>
    </header>

    <ClientOnly>
      <section v-if="drafts.length === 0" class="atrium-drafts__empty">
        <UIcon name="i-lucide-file-check-2" class="size-10 text-dimmed" />
        <p class="atrium-drafts__empty-title">All clear</p>
        <p class="atrium-drafts__empty-sub">
          No drafts in flight. Start a thread or reply and your unfinished work shows up here.
        </p>
      </section>

      <template v-else>
        <section v-if="groups.threads.length" class="atrium-drafts__group">
          <div class="atrium-drafts__group-head">
            <UIcon name="i-lucide-square-pen" class="size-4 text-primary" />
            <h2>Thread drafts</h2>
            <UBadge color="neutral" variant="subtle" size="sm" class="ml-auto">
              {{ groups.threads.length }}
            </UBadge>
          </div>
          <ul class="atrium-drafts__list">
            <li v-for="d in groups.threads" :key="d.id">
              <div class="atrium-drafts__row">
                <button type="button" class="atrium-drafts__row-main" @click="jumpTo(d)">
                  <p class="atrium-drafts__row-title">
                    <span class="truncate">{{ d.label || "(untitled)" }}</span>
                  </p>
                  <p v-if="d.body" class="atrium-drafts__row-body">
                    {{ d.body }}
                  </p>
                  <p class="atrium-drafts__row-meta">
                    <span v-if="d.parentHref">
                      <NuxtLink :to="d.parentHref" class="atrium-drafts__row-board">
                        {{ d.parentLabel }}
                      </NuxtLink>
                    </span>
                    <span class="atrium-drafts__row-dot" v-if="d.parentHref">·</span>
                    <span>{{ relativeTime(d.updatedAt) }}</span>
                  </p>
                </button>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-trash-2"
                  aria-label="Discard draft"
                  @click="askDelete(d.id)"
                />
              </div>
            </li>
          </ul>
        </section>

        <section v-if="groups.replies.length" class="atrium-drafts__group">
          <div class="atrium-drafts__group-head">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-primary" />
            <h2>Reply drafts</h2>
            <UBadge color="neutral" variant="subtle" size="sm" class="ml-auto">
              {{ groups.replies.length }}
            </UBadge>
          </div>
          <ul class="atrium-drafts__list">
            <li v-for="d in groups.replies" :key="d.id">
              <div class="atrium-drafts__row">
                <button type="button" class="atrium-drafts__row-main" @click="jumpTo(d)">
                  <p class="atrium-drafts__row-title">
                    <UIcon name="i-lucide-corner-down-right" class="size-3.5 text-dimmed shrink-0" />
                    <span class="truncate">
                      In <span class="font-medium">{{ d.parentLabel ?? "thread" }}</span>
                    </span>
                  </p>
                  <p v-if="d.body" class="atrium-drafts__row-body">
                    {{ d.body }}
                  </p>
                  <p class="atrium-drafts__row-meta">
                    <span>{{ relativeTime(d.updatedAt) }}</span>
                  </p>
                </button>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-trash-2"
                  aria-label="Discard draft"
                  @click="askDelete(d.id)"
                />
              </div>
            </li>
          </ul>
        </section>

        <section v-if="groups.other.length" class="atrium-drafts__group">
          <div class="atrium-drafts__group-head">
            <UIcon name="i-lucide-file" class="size-4 text-primary" />
            <h2>Other drafts</h2>
          </div>
          <ul class="atrium-drafts__list">
            <li v-for="d in groups.other" :key="d.id">
              <div class="atrium-drafts__row">
                <button type="button" class="atrium-drafts__row-main" @click="jumpTo(d)">
                  <p class="atrium-drafts__row-title">{{ d.label }}</p>
                  <p class="atrium-drafts__row-meta">{{ relativeTime(d.updatedAt) }}</p>
                </button>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-trash-2"
                  aria-label="Discard draft"
                  @click="askDelete(d.id)"
                />
              </div>
            </li>
          </ul>
        </section>
      </template>

      <template #fallback>
        <div class="flex justify-center py-16">
          <UIcon name="i-lucide-loader-circle" class="size-6 text-dimmed animate-spin" />
        </div>
      </template>
    </ClientOnly>

    <UModal v-model:open="confirmOpen" :ui="{ content: 'max-w-md' }">
      <template #header>
        <p class="font-semibold">Discard draft?</p>
      </template>
      <template #body>
        <p class="text-sm">
          The draft is removed from the tree. This can't be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="confirmOpen = false">
            Cancel
          </UButton>
          <UButton color="error" @click="commitDelete">
            Discard
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.atrium-drafts {
  max-width: 56rem;
  margin: 0 auto;
  width: 100%;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.atrium-drafts__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.atrium-drafts__group {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.atrium-drafts__group-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.atrium-drafts__group-head h2 {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ui-text-dimmed);
  margin: 0;
}
.atrium-drafts__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-md, 0.65rem);
  overflow: hidden;
  background: var(--ui-bg);
}
.atrium-drafts__list li + li .atrium-drafts__row {
  border-top: 1px solid var(--ui-border);
}
.atrium-drafts__row {
  display: flex;
  gap: 0.55rem;
  align-items: stretch;
  padding: 0.4rem 0.5rem 0.4rem 0.85rem;
}
.atrium-drafts__row:hover {
  background: color-mix(in srgb, var(--ui-primary) 4%, transparent);
}
.atrium-drafts__row-main {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.4rem 0;
  cursor: pointer;
  color: inherit;
}
.atrium-drafts__row-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.92rem;
  font-weight: 600;
  margin: 0;
  min-width: 0;
}
.atrium-drafts__row-body {
  font-size: 0.8rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.atrium-drafts__row-meta {
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  display: flex;
  gap: 0.35rem;
}
.atrium-drafts__row-board {
  color: inherit;
  text-decoration: none;
}
.atrium-drafts__row-board:hover {
  color: var(--ui-primary);
  text-decoration: underline;
}
.atrium-drafts__row-dot { opacity: 0.5; }
.atrium-drafts__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding: 3.5rem 1rem;
  border: 1px dashed var(--ui-border);
  border-radius: var(--atrium-radius-lg, 1rem);
  text-align: center;
}
.atrium-drafts__empty-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
.atrium-drafts__empty-sub {
  font-size: 0.875rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  max-width: 30rem;
  line-height: 1.5;
}
</style>
