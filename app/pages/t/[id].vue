<script setup lang="ts">
// Thread detail — Discord-style hero with title + status chips, OP as a
// distinguished primary card, replies as avatar-gutter rows with inline
// metadata. Composer pinned at the bottom of the scroll container.

const route = useRoute();
const { doc, publicKeyB64, userName, userColor } = useAbracadabra();
const config = useAtriumConfig();
const { peers } = useAwarenessPeers();

// Resolve a pubkey → live peer info so post bylines can show the friendly name
// and color in the AtriumPeerCard. Falls back to dimmed defaults when the
// author isn't currently connected.
function peerByPubkey(pubkey: string | undefined) {
  if (!pubkey) return null;
  if (pubkey === "me" || pubkey === publicKeyB64.value) {
    return {
      clientId: null as number | null,
      name: userName.value || "you",
      color: userColor.value || "#888",
      publicKey: publicKeyB64.value,
      isMe: true,
    };
  }
  const p = peers.value.find((x) => x.user?.publicKey === pubkey);
  if (p) {
    return {
      clientId: p.clientId,
      name: p.user?.name ?? pubkey.slice(0, 8),
      color: p.user?.color ?? "#888",
      publicKey: pubkey,
      isMe: false,
    };
  }
  return {
    clientId: null,
    name: pubkey === "seed" ? "seed" : pubkey.slice(0, 8),
    color: "#888",
    publicKey: pubkey === "seed" ? null : pubkey,
    isMe: false,
  };
}

const threadId = computed(() => route.params.id as string);
const tree = useChildTree(doc, threadId.value);

// Mark the thread read whenever we land here or the id changes.
const reads = useAtriumReads();
watchEffect(() => {
  const id = threadId.value;
  if (id) reads.markRead(id);
});

const self = computed(() =>
  tree.entries.value.find((e) => e.id === threadId.value),
);

// Replies = all non-reaction, non-other-user-draft descendants under the
// thread, sorted by order ASC. Own drafts are filtered too — the composer
// owns its own state so they don't need to render in the feed.
const replies = computed(() => {
  return tree.entries.value
    .filter((e) => {
      if (e.type === "reaction") return false;
      // Polls render below their attached post, not as top-level replies.
      if (e.type === "poll" || e.type === "poll-option" || e.type === "poll-vote") return false;
      const meta = (e.meta ?? {}) as Record<string, unknown>;
      if (meta.draft) return false;
      let cur: { id: string; parentId: string | null } | undefined = e;
      while (cur && cur.parentId) {
        if (cur.parentId === threadId.value) return true;
        cur = tree.entries.value.find((x) => x.id === cur!.parentId);
      }
      return false;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});

const follows = useAtriumFollows();

const typing = useAtriumTyping();
const typers = typing.typersIn(threadId.value);
watch(threadId, () => { /* recompute via typersIn factory */ });

const typingLabel = computed(() => {
  const list = typers.value;
  if (list.length === 0) return null;
  if (list.length === 1) return `${list[0]?.name ?? "Someone"} is typing…`;
  if (list.length === 2)
    return `${list[0]?.name} and ${list[1]?.name} are typing…`;
  return `${list.length} people are typing…`;
});

const isLocked = computed(() => Boolean((self.value?.meta as any)?.locked));
const isResolved = computed(
  () => ((self.value?.meta as any)?.status as string) === "resolved",
);
const isPinned = computed(
  () => Number((self.value?.meta as any)?.priority ?? 0) >= 4,
);

function ancestorChip(parentId: string | null): string | null {
  if (!parentId || parentId === threadId.value) return null;
  const parent = tree.entries.value.find((e) => e.id === parentId);
  if (!parent) return null;
  const text = parent.label ?? "";
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function authorLabel(author: string | undefined, isMe: boolean): string {
  if (isMe) return "you";
  if (!author || author === "me") return "you";
  if (author === "seed") return "seed";
  return author.slice(0, 8);
}

function relativeTime(ts: number | undefined): string {
  if (!ts) return "";
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

interface PostShape {
  id: string;
  scope: "thread" | "reply";
  index: number;
  author: string;
  authorIsMe: boolean;
  body: string;
  hasRichBody: boolean;
  createdAt: number | undefined;
  parentChip: string | null;
  meta: Record<string, unknown>;
}

// Per-post edit toggles. The Yjs body fragment is live-collaborative, so
// "edit" just means "make the editor interactive"; there's no draft state
// to discard. Done stamps meta.editedAt so the read-only view can label
// the row as edited.
const editingIds = ref<Set<string>>(new Set());
function startEdit(id: string) {
  const next = new Set(editingIds.value);
  next.add(id);
  editingIds.value = next;
}
function finishEdit(id: string) {
  const next = new Set(editingIds.value);
  next.delete(id);
  editingIds.value = next;
  tree.updateMeta(id, { editedAt: Date.now() } as Record<string, unknown>);
}

const op = computed<PostShape>(() => {
  const meta = (self.value?.meta ?? {}) as Record<string, unknown>;
  const author = (meta.author as string) ?? "seed";
  return {
    id: threadId.value,
    scope: "thread",
    index: 0,
    author,
    authorIsMe: author === "me" || author === publicKeyB64.value,
    body:
      (meta.subtitle as string)
      ?? "(Empty thread — the opener can edit this body inline.)",
    hasRichBody: Boolean(meta.hasRichBody),
    createdAt: self.value?.createdAt,
    parentChip: null,
    meta,
  };
});

const replyShapes = computed<PostShape[]>(() => {
  return replies.value.map((r, idx) => {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    const author = (meta.author as string) ?? "seed";
    return {
      id: r.id,
      scope: "reply" as const,
      index: idx + 1,
      author,
      authorIsMe: author === "me" || author === publicKeyB64.value,
      body: (meta.body as string) ?? r.label,
      hasRichBody: Boolean(meta.hasRichBody),
      createdAt: r.createdAt,
      parentChip: ancestorChip(r.parentId),
      meta,
    };
  });
});

// OG meta — title + description + a stable image URL backed by the
// `atrium:og-cache` server runner. The runner mirrors thread metadata
// into Nitro storage; /api/og/<id>.svg renders the card from cache so
// every share-unfurl is a single fast request.
const requestUrl = useRequestURL();
// `.png` suffix asks the route for PNG; the route falls back to SVG
// transparently if satori + resvg aren't installed. Either way the URL is
// stable and unfurler-friendly.
const ogImageUrl = computed(() =>
  `${requestUrl.origin}/api/og/${threadId}.png`,
);

useHead(() => {
  const title = `${self.value?.label ?? "Thread"} · Atrium`;
  const description
    = (self.value?.meta as any)?.subtitle
    ?? `${replies.value.length} replies in this Atrium thread.`;
  const image = ogImageUrl.value;
  return {
    title,
    meta: [
      { name: "description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: image },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
  };
});

// ── Reading-cursor presence ───────────────────────────────────────────────
// Track which post is topmost in view + how far through the thread the
// reader is, then broadcast via awareness so peers see a ghost dot on the
// right margin. Updates are throttled to ~6/s — that's snappy enough for
// "follow along" without flooding awareness traffic.

const cursors = useAtriumThreadCursors(threadId);
const visiblePostIds = ref<Set<string>>(new Set());

let observer: IntersectionObserver | null = null;
let scrollContainer: HTMLElement | Window | null = null;
let lastTick = 0;
const TICK_MS = 150;

function findScrollContainer(): HTMLElement | Window {
  const main = document.querySelector<HTMLElement>(".atrium-main");
  return main ?? window;
}

function getScrollMetrics(container: HTMLElement | Window) {
  if (container === window) {
    const doc = document.scrollingElement ?? document.documentElement;
    return {
      scrollTop: doc.scrollTop,
      maxScroll: Math.max(1, doc.scrollHeight - doc.clientHeight),
    };
  }
  const el = container as HTMLElement;
  return {
    scrollTop: el.scrollTop,
    maxScroll: Math.max(1, el.scrollHeight - el.clientHeight),
  };
}

function publishCursor() {
  const now = Date.now();
  if (now - lastTick < TICK_MS) return;
  lastTick = now;
  if (!scrollContainer) return;
  const { scrollTop, maxScroll } = getScrollMetrics(scrollContainer);
  const fraction = scrollTop / maxScroll;

  // Topmost visible row by DOM order
  let topId: string | null = null;
  let topY = Number.POSITIVE_INFINITY;
  for (const id of visiblePostIds.value) {
    const el = document.querySelector<HTMLElement>(`[data-post-id="${id}"]`);
    if (!el) continue;
    const y = el.getBoundingClientRect().top;
    if (y < topY && y > -200) {
      topY = y;
      topId = id;
    }
  }
  cursors.setCursor(topId, fraction);
}

function onScroll() {
  publishCursor();
}

function attachObservers() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      const next = new Set(visiblePostIds.value);
      for (const ent of entries) {
        const id = (ent.target as HTMLElement).dataset.postId;
        if (!id) continue;
        if (ent.isIntersecting) next.add(id);
        else next.delete(id);
      }
      visiblePostIds.value = next;
      publishCursor();
    },
    { threshold: [0, 0.5, 1] },
  );
  for (const row of document.querySelectorAll<HTMLElement>(".atrium-feed [data-post-id]")) {
    observer.observe(row);
  }
}

let heartbeat: ReturnType<typeof setInterval> | null = null;

// Per-thread scroll restoration — write the latest scroll fraction to
// sessionStorage so reopening a thread lands you where you left off.
function scrollKey(): string {
  return `atrium:thread-scroll:${threadId.value}`;
}
function saveScrollFraction() {
  if (!scrollContainer) return;
  const { scrollTop, maxScroll } = getScrollMetrics(scrollContainer);
  const f = scrollTop / maxScroll;
  try { sessionStorage.setItem(scrollKey(), String(f)); }
  catch {}
}
function restoreScrollFraction() {
  if (!scrollContainer) return;
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(scrollKey()); }
  catch {}
  if (!raw) return;
  const f = Number(raw);
  if (!Number.isFinite(f) || f <= 0) return;
  const { maxScroll } = getScrollMetrics(scrollContainer);
  const target = maxScroll * Math.min(1, Math.max(0, f));
  if (scrollContainer === window) {
    window.scrollTo({ top: target, behavior: "auto" });
  }
  else {
    (scrollContainer as HTMLElement).scrollTop = target;
  }
}

// ── Permalink anchor ─────────────────────────────────────────────────────
// When the URL has a `#<postId>` fragment, smooth-scroll to that post and
// flash a highlight ring. Done after first paint so the feed is mounted.
const flashedId = ref<string | null>(null);

function jumpToHash() {
  const hash = route.hash.replace(/^#/, "");
  if (!hash) return;
  const el = document.querySelector<HTMLElement>(`[data-post-id="${CSS.escape(hash)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  flashedId.value = hash;
  window.setTimeout(() => {
    if (flashedId.value === hash) flashedId.value = null;
  }, 2200);
}

async function copyPermalink(postId: string) {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}/t/${threadId.value}#${postId}`;
  try {
    await navigator.clipboard.writeText(url);
    useToast().add({
      title: "Permalink copied",
      description: url.length > 64 ? `${url.slice(0, 60)}…` : url,
      icon: "i-lucide-link",
    });
  }
  catch {}
}

watch(() => route.hash, () => {
  // Wait for the row to be in the DOM if the hash changes after mount.
  nextTick(() => jumpToHash());
});

onMounted(() => {
  scrollContainer = findScrollContainer();
  scrollContainer.addEventListener("scroll", onScroll, { passive: true });
  // Wait one tick for the feed to render before measuring + restoring.
  nextTick(() => {
    attachObservers();
    // Hash anchor wins over saved scroll position.
    if (route.hash) jumpToHash();
    else restoreScrollFraction();
    publishCursor();
  });
  // Heartbeat refresh so peers don't TTL us when we sit still. Also persists
  // the latest scroll fraction so reopening the thread restores position.
  heartbeat = setInterval(() => {
    // Bypass the throttle by resetting lastTick — the publish itself is cheap.
    lastTick = 0;
    publishCursor();
    saveScrollFraction();
  }, 4000);
});

// Re-attach observers if the reply list grows
watch(replyShapes, () => {
  nextTick(() => attachObservers());
});

onBeforeUnmount(() => {
  saveScrollFraction();
  observer?.disconnect();
  observer = null;
  if (scrollContainer) {
    scrollContainer.removeEventListener("scroll", onScroll);
    scrollContainer = null;
  }
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  cursors.clearCursor();
});
</script>

<template>
  <div class="atrium-thread">
    <header class="atrium-thread__head">
      <div class="atrium-thread__title-row">
        <div class="min-w-0 flex-1">
          <div class="atrium-thread__chips">
            <UBadge
              v-if="isPinned"
              color="primary"
              variant="subtle"
              size="sm"
              icon="i-lucide-pin"
            >pinned</UBadge>
            <UBadge
              v-if="isLocked"
              color="warning"
              variant="subtle"
              size="sm"
              icon="i-lucide-lock"
            >locked</UBadge>
            <UBadge
              v-if="isResolved"
              color="success"
              variant="subtle"
              size="sm"
              icon="i-lucide-check-circle-2"
            >resolved</UBadge>
            <UBadge
              v-for="tag in (self?.meta as any)?.tags ?? []"
              :key="tag"
              color="neutral"
              variant="subtle"
              size="sm"
            >#{{ tag }}</UBadge>
          </div>
          <h1 class="atrium-thread__title">{{ self?.label ?? "Thread" }}</h1>
          <p class="atrium-thread__meta">
            <span>{{ relativeTime(self?.createdAt) }}</span>
            <span class="atrium-thread__dot">·</span>
            <span>{{ replies.length }} {{ replies.length === 1 ? 'reply' : 'replies' }}</span>
            <span class="atrium-thread__dot">·</span>
            <span>{{ config.replyMode }} mode</span>
          </p>
        </div>
        <UTooltip :text="follows.isFollowing(threadId) ? 'Unfollow this thread' : 'Follow this thread'">
          <UButton
            :icon="follows.isFollowing(threadId) ? 'i-lucide-heart' : 'i-lucide-heart'"
            :color="follows.isFollowing(threadId) ? 'error' : 'neutral'"
            :variant="follows.isFollowing(threadId) ? 'soft' : 'ghost'"
            size="sm"
            square
            :class="follows.isFollowing(threadId) ? 'atrium-thread__follow--on' : ''"
            :aria-label="follows.isFollowing(threadId) ? 'Unfollow' : 'Follow'"
            @click="follows.toggle(threadId)"
          />
        </UTooltip>
        <ModActions :entry-id="threadId" :tree="tree" scope="thread" />
      </div>
    </header>

    <ol class="atrium-feed">
      <li
        v-for="post in [op, ...replyShapes]"
        :key="post.id"
        :data-post-id="post.id"
        :class="[
          'atrium-feed__row',
          post.scope === 'thread' ? 'atrium-feed__row--op' : null,
          post.authorIsMe ? 'atrium-feed__row--mine' : null,
          flashedId === post.id ? 'atrium-feed__row--flash' : null,
        ]"
      >
        <AtriumPeerCard
          v-if="peerByPubkey(post.author)"
          :name="peerByPubkey(post.author)!.name"
          :color="peerByPubkey(post.author)!.color"
          :public-key="peerByPubkey(post.author)!.publicKey"
          :client-id="peerByPubkey(post.author)!.clientId"
          :is-me="peerByPubkey(post.author)!.isMe"
          :size="36"
        >
          <NuxtLink
            v-if="peerByPubkey(post.author)?.publicKey"
            :to="`/u/${peerByPubkey(post.author)!.publicKey}`"
            class="atrium-feed__avatar-btn"
            :aria-label="`Open ${peerByPubkey(post.author)!.name}'s profile`"
          >
            <AtriumAvatar
              :author="post.author"
              :mine="post.authorIsMe"
              :size="36"
            />
          </NuxtLink>
          <button v-else type="button" class="atrium-feed__avatar-btn">
            <AtriumAvatar
              :author="post.author"
              :mine="post.authorIsMe"
              :size="36"
            />
          </button>
        </AtriumPeerCard>
        <AtriumAvatar
          v-else
          :author="post.author"
          :mine="post.authorIsMe"
          :size="36"
        />
        <div class="atrium-feed__col min-w-0 flex-1">
          <header class="atrium-feed__header">
            <span class="atrium-feed__author">
              {{ authorLabel(post.author, post.authorIsMe) }}
            </span>
            <span class="atrium-feed__time">{{ relativeTime(post.createdAt) }}</span>
            <span v-if="post.scope === 'thread'" class="atrium-feed__op-pill">
              opener
            </span>
            <span
              v-if="post.parentChip"
              class="atrium-feed__quote"
            >
              <UIcon name="i-lucide-corner-up-left" class="size-3" />
              {{ post.parentChip }}
            </span>
          </header>
          <div class="atrium-feed__body">
            <ClientOnly v-if="post.hasRichBody">
              <AtriumPostEditor
                :doc-id="post.id"
                :editable="editingIds.has(post.id)"
              />
              <template #fallback>
                <AtriumMarkdown :source="post.body" />
              </template>
            </ClientOnly>
            <AtriumMarkdown v-else :source="post.body" />
            <ClientOnly>
              <AtriumPostAttachments :post-id="post.id" :tree="tree" />
            </ClientOnly>
            <p v-if="(post.scope !== 'thread') && (post.meta as any)?.editedAt" class="atrium-feed__edited">
              <UIcon name="i-lucide-pencil" class="size-3 inline-block" />
              edited {{ relativeTime((post.meta as any).editedAt) }}
            </p>
          </div>
          <footer class="atrium-feed__foot">
            <template v-if="editingIds.has(post.id)">
              <span class="atrium-feed__editing-pill">
                <UIcon name="i-lucide-pencil" class="size-3" /> Editing live
              </span>
              <UButton
                color="primary"
                variant="soft"
                size="xs"
                icon="i-lucide-check"
                @click="finishEdit(post.id)"
              >
                Done
              </UButton>
            </template>
            <template v-else>
              <ReactionStrip :post-id="post.id" :tree="tree" />
              <div class="atrium-feed__foot-right">
                <BookmarkButton
                  :entry-id="post.id"
                  :label="post.scope === 'thread' ? self?.label : (post.body || self?.label || '')"
                  :href="post.scope === 'thread' ? `/t/${threadId}` : `/t/${threadId}#${post.id}`"
                  :thread-label="self?.label"
                  :snippet="(post.body || '').replace(/<[^>]+>/g, '').slice(0, 160)"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-link"
                  :aria-label="`Copy permalink to this ${post.scope === 'thread' ? 'thread' : 'reply'}`"
                  :title="'Copy permalink'"
                  class="atrium-feed__permalink"
                  @click="copyPermalink(post.id)"
                />
                <ModActions
                  :entry-id="post.id"
                  :tree="tree"
                  :scope="post.scope"
                  @edit="startEdit"
                />
              </div>
            </template>
          </footer>
        </div>
      </li>
    </ol>

    <ClientOnly>
      <AtriumReactionStream :thread-id="threadId" :tree="tree" />
    </ClientOnly>

    <ClientOnly>
      <AtriumThreadCursors :thread-id="threadId" />
    </ClientOnly>

    <Transition name="atrium-typing">
      <div v-if="typingLabel" class="atrium-thread__typing">
        <span class="atrium-thread__typing-dots" aria-hidden="true">
          <span /><span /><span />
        </span>
        <span class="atrium-thread__typing-text">{{ typingLabel }}</span>
      </div>
    </Transition>

    <footer class="atrium-thread__foot">
      <UAlert
        v-if="isLocked"
        icon="i-lucide-lock"
        color="warning"
        variant="subtle"
        title="Thread locked"
        description="A moderator has locked this thread. Unlock from the ⋯ menu to reply."
      />
      <ReplyComposer v-else :thread-id="threadId" />
    </footer>
  </div>
</template>

<style scoped>
.atrium-thread {
  position: relative;
  max-width: 56rem;
  margin: 0 auto;
  width: 100%;
  padding: 1.4rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}
.atrium-thread__follow--on :deep(svg) {
  fill: currentColor;
}
.atrium-feed__avatar-btn {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 0.5rem;
}
.atrium-feed__avatar-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ui-primary) 60%, transparent);
  outline-offset: 2px;
}
.atrium-thread__head {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.atrium-thread__title-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}
.atrium-thread__chips {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.atrium-thread__title {
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  margin: 0;
}
.atrium-thread__meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8125rem;
  color: var(--ui-text-dimmed);
  margin: 0.45rem 0 0;
}
.atrium-thread__dot { opacity: 0.5; }

.atrium-feed {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(0.35rem * var(--atrium-density, 1));
}
.atrium-feed__row {
  display: flex;
  gap: 0.85rem;
  padding: calc(0.7rem * var(--atrium-density, 1)) 0.85rem
    calc(0.55rem * var(--atrium-density, 1));
  border-radius: var(--atrium-radius-md, 0.65rem);
  border: 1px solid transparent;
  transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.4s ease;
  scroll-margin-top: 80px;
}
.atrium-feed__permalink {
  transition: opacity 0.15s ease;
}
.atrium-feed__row--flash {
  background: color-mix(in srgb, var(--ui-primary) 14%, var(--ui-bg));
  border-color: var(--ui-primary);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--ui-primary) 30%, transparent),
    0 0 22px color-mix(in srgb, var(--ui-primary) 22%, transparent);
}
.atrium-feed__edited {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  margin: 0.4rem 0 0;
  font-style: italic;
}
.atrium-feed__editing-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ui-primary);
  background: color-mix(in srgb, var(--ui-primary) 12%, transparent);
}
.atrium-feed__row:hover {
  background: color-mix(in srgb, var(--ui-bg-elevated) 60%, transparent);
}
.atrium-feed__row--op {
  background: color-mix(in srgb, var(--ui-primary) 6%, var(--ui-bg));
  border-color: color-mix(in srgb, var(--ui-primary) 28%, var(--ui-border));
  padding: 0.9rem 1rem 0.75rem;
}
.atrium-feed__row--op:hover {
  background: color-mix(in srgb, var(--ui-primary) 9%, var(--ui-bg));
}
.atrium-feed__row--mine {
  background: color-mix(in srgb, var(--ui-primary) 3%, transparent);
}

.atrium-feed__row > .atrium-avatar {
  margin-top: 0.1rem;
}
.atrium-feed__col {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.atrium-feed__header {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}
.atrium-feed__author {
  font-weight: 600;
  font-size: 0.9rem;
}
.atrium-feed__time {
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  font-variant-numeric: tabular-nums;
}
.atrium-feed__op-pill {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-primary);
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
  border-radius: 9999px;
  padding: 0.1rem 0.5rem;
}
.atrium-feed__quote {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  background: var(--ui-bg-elevated);
  border-radius: 0.4rem;
  padding: 0.12rem 0.45rem;
}
.atrium-feed__body {
  font-size: 0.93rem;
  line-height: 1.55;
}
.atrium-feed__body-fallback {
  margin: 0;
  white-space: pre-wrap;
}
.atrium-feed__row--op .atrium-feed__body,
.atrium-feed__row--op .atrium-feed__body-fallback {
  font-size: 1rem;
}
.atrium-feed__foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.2rem;
}
.atrium-feed__foot-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.atrium-thread__foot {
  margin-top: 0.5rem;
}
.atrium-thread__typing {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.85rem;
  font-size: 0.75rem;
  color: var(--ui-text-dimmed);
  background: color-mix(in srgb, var(--ui-primary) 4%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-primary) 20%, var(--ui-border));
  border-radius: 9999px;
  width: fit-content;
}
.atrium-thread__typing-dots {
  display: inline-flex;
  gap: 0.18rem;
}
.atrium-thread__typing-dots span {
  width: 0.32rem;
  height: 0.32rem;
  border-radius: 9999px;
  background: var(--ui-primary);
  animation: atrium-typing-bounce 1.1s ease-in-out infinite;
}
.atrium-thread__typing-dots span:nth-child(2) { animation-delay: 0.18s; }
.atrium-thread__typing-dots span:nth-child(3) { animation-delay: 0.36s; }
@keyframes atrium-typing-bounce {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}
.atrium-typing-enter-active,
.atrium-typing-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.atrium-typing-enter-from,
.atrium-typing-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
