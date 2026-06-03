<script setup lang="ts">
// User profile page. Shows the avatar + name + activity + the user's
// editable profile (bio, status, links). Self mode adds an Edit button
// that opens the inline editor; everyone sees the same rendered values.

const route = useRoute();
const nav = useAtriumNav();
const { publicKeyB64 } = useAbracadabra();
const { peers } = useAwarenessPeers();

const pubkey = computed(() => route.params.pubkey as string);

const peer = computed(() => peers.value.find((p) => p.user?.publicKey === pubkey.value) ?? null);

const isMe = computed(() => pubkey.value === publicKeyB64.value);

const profileApi = useAtriumProfile(pubkey.value);
const profile = profileApi.profile;

const displayName = computed(() => {
  if (isMe.value) return "You";
  return peer.value?.user?.name ?? "Unknown peer";
});

const displayColor = computed(() => peer.value?.user?.color ?? "#888");

const status = computed(() => {
  if (isMe.value) return "connected";
  if (!peer.value) return "disconnected";
  return peer.value.idle ? "idle" : "connected";
});

interface ContributionRow {
  id: string;
  label: string;
  threadId: string;
  threadLabel: string;
  boardLabel: string | null;
  createdAt: number;
  isThread: boolean;
}

// Derive everything this user has contributed in a single pass over the
// doc tree, then split into threads/posts/reactions and sort by recency.
const contributions = computed(() => {
  const entries = nav.allEntries.value;
  const threadsOpened: ContributionRow[] = [];
  const repliesPosted: ContributionRow[] = [];
  let reactionCount = 0;

  // Helper to resolve a row's thread parent + board parent.
  function resolveThreadAndBoard(entryId: string): {
    threadId: string;
    threadLabel: string;
    boardLabel: string | null;
  } | null {
    let cur = entries.find((e) => e.id === entryId);
    let safety = 0;
    let thread: { id: string; label: string } | null = null;
    while (cur && safety++ < 32) {
      if (cur.type === "thread") {
        thread = { id: cur.id, label: cur.label };
        // walk one more level for the board label
        const board = entries.find((e) => e.id === cur!.parentId);
        return {
          threadId: thread.id,
          threadLabel: thread.label,
          boardLabel: board?.label ?? null,
        };
      }
      cur = entries.find((e) => e.id === cur!.parentId);
    }
    return null;
  }

  for (const e of entries) {
    const meta = (e.meta ?? {}) as Record<string, unknown>;
    if (meta.author !== pubkey.value) continue;
    if (e.type === "reaction") {
      reactionCount += 1;
      continue;
    }
    if (e.type === "thread") {
      const board = entries.find((x) => x.id === e.parentId);
      threadsOpened.push({
        id: e.id,
        label: e.label,
        threadId: e.id,
        threadLabel: e.label,
        boardLabel: board?.label ?? null,
        createdAt: e.createdAt ?? 0,
        isThread: true,
      });
    }
    else {
      const ctx = resolveThreadAndBoard(e.id);
      if (!ctx) continue;
      repliesPosted.push({
        id: e.id,
        label: (meta.body as string) ?? e.label ?? "",
        threadId: ctx.threadId,
        threadLabel: ctx.threadLabel,
        boardLabel: ctx.boardLabel,
        createdAt: e.createdAt ?? 0,
        isThread: false,
      });
    }
  }
  threadsOpened.sort((a, b) => b.createdAt - a.createdAt);
  repliesPosted.sort((a, b) => b.createdAt - a.createdAt);
  return { threadsOpened, repliesPosted, reactionCount };
});

const stats = computed(() => ({
  threads: contributions.value.threadsOpened.length,
  posts: contributions.value.repliesPosted.length,
  reactions: contributions.value.reactionCount,
}));

const reputation = useAtriumReputation(pubkey);

const recentThreads = computed(() =>
  contributions.value.threadsOpened.slice(0, 6),
);
const recentReplies = computed(() =>
  contributions.value.repliesPosted.slice(0, 8),
);

function relativeTime(ts: number): string {
  if (!ts) return "—";
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

function trimBody(body: string, max = 140): string {
  const clean = body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

const toast = useToast();

const dm = useAtriumDM();
function openDM() {
  if (isMe.value) return;
  dm.openWith({
    pubkey: pubkey.value,
    name: displayName.value,
    color: displayColor.value,
  });
}

function copyPubkey() {
  navigator.clipboard.writeText(pubkey.value).then(() => {
    toast.add({
      title: "Pubkey copied",
      description: pubkey.value.slice(0, 16) + "…",
      icon: "i-lucide-key",
    });
  }).catch(() => {});
}

function copyProfileLink() {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}/u/${pubkey.value}`;
  navigator.clipboard.writeText(url).then(() => {
    toast.add({
      title: "Profile link copied",
      description: url,
      icon: "i-lucide-link",
    });
  }).catch(() => {});
}

useHead(() => ({ title: `${displayName.value} · Atrium` }));

// ── Edit-profile state ───────────────────────────────────────────────────
const editOpen = ref(false);
const draftBio = ref("");
const draftEmoji = ref("");
const draftStatusText = ref("");
const draftLinks = ref<{ label: string; url: string }[]>([]);

function openEdit() {
  draftBio.value = profile.value.bio;
  draftEmoji.value = profile.value.statusEmoji;
  draftStatusText.value = profile.value.statusText;
  draftLinks.value = profile.value.links.map((l) => ({ ...l }));
  if (!draftLinks.value.length) draftLinks.value.push({ label: "", url: "" });
  editOpen.value = true;
}

function addDraftLink() {
  if (draftLinks.value.length >= 6) return;
  draftLinks.value.push({ label: "", url: "" });
}

function removeDraftLink(i: number) {
  draftLinks.value.splice(i, 1);
}

function saveProfile() {
  const links = draftLinks.value
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.label && l.url);
  profileApi.update({
    bio: draftBio.value.trim(),
    statusEmoji: draftEmoji.value.trim(),
    statusText: draftStatusText.value.trim(),
    links,
  });
  editOpen.value = false;
  toast.add({
    title: "Profile saved",
    description: "Visible to everyone who opens your page.",
    icon: "i-lucide-user-check",
  });
}
</script>

<template>
  <div class="atrium-user">
    <ClientOnly>
      <header class="atrium-user__head">
        <AtriumAvatar
          :name="displayName"
          :color="displayColor"
          :mine="isMe"
          :status="status as any"
          :size="96"
        />
        <div class="atrium-user__head-text">
          <h1 class="atrium-user__name">
            {{ displayName }}
            <span v-if="isMe" class="atrium-user__you">(you)</span>
          </h1>
          <p class="atrium-user__pubkey">
            <code>{{ pubkey.slice(0, 16) }}…</code>
          </p>
          <p class="atrium-user__status">
            <span
              class="atrium-user__dot"
              :class="`atrium-user__dot--${status}`"
              aria-hidden="true"
            />
            <span v-if="status === 'connected'">Online now</span>
            <span v-else-if="status === 'idle'">Idle</span>
            <span v-else>Offline</span>
          </p>
        </div>
      </header>

      <section class="atrium-user__stats">
        <article class="atrium-user__stat atrium-user__stat--karma">
          <dt>
            <UIcon :name="reputation.badgeIcon" class="size-3.5 text-primary" />
            Karma
          </dt>
          <dd>{{ reputation.karma }}</dd>
          <span class="atrium-user__karma-badge">{{ reputation.badge }}</span>
        </article>
        <article class="atrium-user__stat">
          <dt>Threads opened</dt>
          <dd>{{ stats.threads }}</dd>
        </article>
        <article class="atrium-user__stat">
          <dt>Replies</dt>
          <dd>{{ stats.posts }}</dd>
        </article>
        <article class="atrium-user__stat">
          <dt>Reactions received</dt>
          <dd>{{ reputation.breakdown.reactionsReceived }}</dd>
        </article>
      </section>

      <div class="atrium-user__actions">
        <UButton
          v-if="isMe"
          color="primary"
          size="sm"
          icon="i-lucide-pencil"
          @click="openEdit"
        >
          Edit profile
        </UButton>
        <UButton
          color="primary"
          variant="soft"
          size="sm"
          icon="i-lucide-message-square"
          :disabled="isMe"
          @click="openDM"
        >
          Direct message
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-key"
          @click="copyPubkey"
        >
          Copy pubkey
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-link"
          @click="copyProfileLink"
        >
          Share profile
        </UButton>
      </div>

      <section
        v-if="profile.statusEmoji || profile.statusText || profile.bio || profile.links.length"
        class="atrium-user__profile"
      >
        <p
          v-if="profile.statusEmoji || profile.statusText"
          class="atrium-user__profile-status"
        >
          <span v-if="profile.statusEmoji" class="atrium-user__profile-emoji">
            {{ profile.statusEmoji }}
          </span>
          <span>{{ profile.statusText || "" }}</span>
        </p>
        <p v-if="profile.bio" class="atrium-user__profile-bio">{{ profile.bio }}</p>
        <ul v-if="profile.links.length" class="atrium-user__profile-links">
          <li v-for="(l, i) in profile.links" :key="i">
            <a :href="l.url" target="_blank" rel="noopener noreferrer">
              <UIcon name="i-lucide-link" class="size-3.5" />
              {{ l.label }}
            </a>
          </li>
        </ul>
      </section>

      <section v-if="recentThreads.length > 0" class="atrium-user__section">
        <header class="atrium-user__section-head">
          <UIcon name="i-lucide-message-square-text" class="size-4 text-primary" />
          <h2>Recent threads opened</h2>
          <UBadge color="primary" variant="subtle" size="sm" class="ml-auto">
            {{ stats.threads }}
          </UBadge>
        </header>
        <ul class="atrium-user__list">
          <li v-for="t in recentThreads" :key="t.id">
            <NuxtLink :to="`/t/${t.threadId}`" class="atrium-user__row">
              <div class="atrium-user__row-body">
                <p class="atrium-user__row-title truncate">{{ t.threadLabel }}</p>
                <p class="atrium-user__row-meta">
                  <span v-if="t.boardLabel">#{{ t.boardLabel }}</span>
                  <span class="atrium-user__row-dot">·</span>
                  <span>{{ relativeTime(t.createdAt) }}</span>
                </p>
              </div>
              <UIcon name="i-lucide-arrow-up-right" class="size-3.5 text-dimmed" />
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section v-if="recentReplies.length > 0" class="atrium-user__section">
        <header class="atrium-user__section-head">
          <UIcon name="i-lucide-corner-down-right" class="size-4 text-primary" />
          <h2>Recent replies</h2>
          <UBadge color="primary" variant="subtle" size="sm" class="ml-auto">
            {{ stats.posts }}
          </UBadge>
        </header>
        <ul class="atrium-user__list">
          <li v-for="r in recentReplies" :key="r.id">
            <NuxtLink :to="`/t/${r.threadId}`" class="atrium-user__row">
              <div class="atrium-user__row-body">
                <p class="atrium-user__row-snippet">
                  {{ trimBody(r.label) }}
                </p>
                <p class="atrium-user__row-meta">
                  <span class="truncate">in {{ r.threadLabel }}</span>
                  <span class="atrium-user__row-dot">·</span>
                  <span>{{ relativeTime(r.createdAt) }}</span>
                </p>
              </div>
              <UIcon name="i-lucide-arrow-up-right" class="size-3.5 text-dimmed" />
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section
        v-if="recentThreads.length === 0 && recentReplies.length === 0"
        class="atrium-user__empty"
      >
        <UIcon name="i-lucide-ghost" class="size-8 text-dimmed" />
        <p class="atrium-user__empty-title">Nothing here yet</p>
        <p class="atrium-user__empty-sub">
          <template v-if="isMe">Start a thread or reply to see your activity here.</template>
          <template v-else>{{ displayName }} hasn't posted in this forum yet.</template>
        </p>
      </section>

      <template #fallback>
        <div class="atrium-user__loading">
          <UIcon name="i-lucide-loader-circle" class="size-5 text-dimmed animate-spin" />
        </div>
      </template>
    </ClientOnly>

    <UModal v-model:open="editOpen" :ui="{ content: 'max-w-lg' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-user-cog" class="size-5 text-primary" />
          <p class="font-semibold">Edit your profile</p>
        </div>
      </template>
      <template #body>
        <div class="flex flex-col gap-3">
          <UFormField label="Status">
            <div class="flex gap-2">
              <UInput
                v-model="draftEmoji"
                placeholder="😀"
                class="w-16"
                :maxlength="3"
              />
              <UInput
                v-model="draftStatusText"
                placeholder="What you're up to right now…"
                class="flex-1"
                :maxlength="80"
              />
            </div>
          </UFormField>
          <UFormField label="Bio">
            <UTextarea
              v-model="draftBio"
              placeholder="A short intro — what you build, what you care about."
              :rows="3"
              :maxlength="400"
            />
          </UFormField>
          <UFormField label="Links">
            <ul class="flex flex-col gap-2">
              <li
                v-for="(l, i) in draftLinks"
                :key="i"
                class="flex items-center gap-2"
              >
                <UInput
                  v-model="l.label"
                  placeholder="Label"
                  class="w-32"
                  :maxlength="40"
                />
                <UInput
                  v-model="l.url"
                  placeholder="https://"
                  class="flex-1"
                  :maxlength="200"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  size="sm"
                  :aria-label="'Remove link'"
                  @click="removeDraftLink(i)"
                />
              </li>
            </ul>
            <UButton
              class="mt-2"
              color="neutral"
              variant="ghost"
              icon="i-lucide-plus"
              size="sm"
              :disabled="draftLinks.length >= 6"
              @click="addDraftLink"
            >
              Add link
            </UButton>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="editOpen = false">
            Cancel
          </UButton>
          <UButton color="primary" icon="i-lucide-save" @click="saveProfile">
            Save profile
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.atrium-user {
  max-width: 56rem;
  margin: 0 auto;
  width: 100%;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.atrium-user__head {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.25rem 1.4rem;
  border: 1px solid var(--ui-border);
  border-radius: 1rem;
  background:
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--ui-primary) 10%, transparent), transparent 55%),
    var(--ui-bg);
}
.atrium-user__head-text {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.atrium-user__name {
  font-size: 1.6rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.atrium-user__you {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--ui-text-dimmed);
}
.atrium-user__pubkey code {
  font-family: var(--font-mono, ui-monospace);
  font-size: 0.8125rem;
  color: var(--ui-text-dimmed);
}
.atrium-user__status {
  font-size: 0.8rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.atrium-user__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--ui-text-dimmed);
}
.atrium-user__dot--connected { background: var(--ui-color-success-500, #10b981); }
.atrium-user__dot--idle { background: var(--ui-color-warning-500, #f59e0b); }
.atrium-user__dot--disconnected { background: var(--ui-text-dimmed); }
.atrium-user__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}
.atrium-user__stat {
  position: relative;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  padding: 1rem;
  background: var(--ui-bg);
}
.atrium-user__stat--karma {
  background:
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--ui-primary) 14%, transparent), transparent 60%),
    var(--ui-bg);
  border-color: color-mix(in srgb, var(--ui-primary) 28%, var(--ui-border));
}
.atrium-user__stat--karma dt {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.atrium-user__karma-badge {
  display: inline-block;
  margin-top: 0.35rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-primary);
  padding: 0.15rem 0.4rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
}
.atrium-user__stat dt {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}
.atrium-user__stat dd {
  margin: 0.25rem 0 0;
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.atrium-user__loading {
  padding: 4rem;
  display: flex;
  justify-content: center;
}
.atrium-user__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.atrium-user__profile {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  background: var(--ui-bg);
}
.atrium-user__profile-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--ui-text);
  margin: 0;
}
.atrium-user__profile-emoji {
  font-size: 1.05rem;
}
.atrium-user__profile-bio {
  font-size: 0.9rem;
  color: var(--ui-text);
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}
.atrium-user__profile-links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
}
.atrium-user__profile-links a {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.825rem;
  color: var(--ui-primary);
  text-decoration: none;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
}
.atrium-user__profile-links a:hover {
  background: color-mix(in srgb, var(--ui-primary) 18%, transparent);
}
.atrium-user__section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.atrium-user__section-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.15rem;
}
.atrium-user__section-head h2 {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
  margin: 0;
}
.atrium-user__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-md, 0.65rem);
  overflow: hidden;
  background: var(--ui-bg);
}
.atrium-user__list li + li .atrium-user__row {
  border-top: 1px solid var(--ui-border);
}
.atrium-user__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  text-decoration: none;
  color: inherit;
  transition: background 0.15s ease;
}
.atrium-user__row:hover {
  background: color-mix(in srgb, var(--ui-primary) 5%, transparent);
}
.atrium-user__row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.atrium-user__row-title {
  font-size: 0.9rem;
  font-weight: 500;
  margin: 0;
}
.atrium-user__row-snippet {
  font-size: 0.875rem;
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.atrium-user__row-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  min-width: 0;
}
.atrium-user__row-dot { opacity: 0.5; }
.atrium-user__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
  border: 1px dashed var(--ui-border);
  border-radius: var(--atrium-radius-lg, 1rem);
  text-align: center;
}
.atrium-user__empty-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}
.atrium-user__empty-sub {
  font-size: 0.825rem;
  color: var(--ui-text-dimmed);
  margin: 0;
}
</style>
