<script setup lang="ts">
// RightRail — Discord-style member panel. Always-visible 232px column listing
// every connected peer grouped by status (In voice / Online / Idle / Offline).
// Each row is a clickable AtriumPeerCard trigger. A header carries a member
// search filter; sections at the bottom embed Hot now + share-link tools so
// nothing gets lost from the earlier popover-only strip.

const nav = useAtriumNav();
const route = useRoute();
const { peers, currentUser } = useAwarenessPeers();
const voice = useAtriumVoice();
const toast = useToast();

const activeForum = computed(() => nav.trail.value.forum);
const activeThread = computed(() => nav.trail.value.thread);
const activeVoiceRoomId = computed(() => voice.myRoomId.value);
const activeVoiceRoom = computed(() =>
  activeVoiceRoomId.value ? nav.find(activeVoiceRoomId.value) : null,
);

interface MemberRow {
  key: string;
  clientId: number;
  publicKey: string | null;
  name: string;
  color: string;
  isMe: boolean;
  idle: boolean;
  inVoice: boolean;
  roleBadge: string;
  roleIcon: string;
  roleLevel: number;
}

// Reactive lookup so each member row's role is derived from karma; we don't
// rebuild reputation per render — useAtriumReputation memoizes per pubkey.
const nav2 = useAtriumNav();
function roleFor(pubkey: string | null): { badge: string; icon: string; level: number } {
  if (!pubkey) return { badge: "Guest", icon: "i-lucide-user", level: 0 };
  // Inline computation (same shape as useAtriumReputation) so we don't fan
  // out 50 computeds per render. Walk the tree once per filter pass.
  const entries = nav2.allEntries.value;
  let threads = 0;
  let replies = 0;
  let reactionsReceived = 0;
  const myPostIds = new Set<string>();
  for (const e of entries) {
    const meta = (e.meta ?? {}) as Record<string, unknown>;
    if (meta.author !== pubkey) continue;
    if (e.type === "reaction") continue;
    if (e.type === "thread") threads += 1;
    else replies += 1;
    myPostIds.add(e.id);
  }
  for (const e of entries) {
    if (e.type !== "reaction") continue;
    if (!e.parentId || !myPostIds.has(e.parentId)) continue;
    reactionsReceived += 1;
  }
  const karma = threads * 2 + replies + reactionsReceived;
  if (karma >= 200) return { badge: "Pillar", icon: "i-lucide-crown", level: 5 };
  if (karma >= 80) return { badge: "Voice", icon: "i-lucide-mic", level: 4 };
  if (karma >= 30) return { badge: "Regular", icon: "i-lucide-flame", level: 3 };
  if (karma >= 10) return { badge: "Contributor", icon: "i-lucide-sprout", level: 2 };
  if (karma >= 1) return { badge: "Newcomer", icon: "i-lucide-seedling", level: 1 };
  return { badge: "Lurker", icon: "i-lucide-eye", level: 0 };
}

const members = computed<MemberRow[]>(() => {
  const out: MemberRow[] = [];
  const me = currentUser.value;
  const voiceState = (me as any)?.["atrium-voice"];
  if (me) {
    const role = roleFor(me.user?.publicKey ?? null);
    out.push({
      key: `me-${me.clientId}`,
      clientId: me.clientId,
      publicKey: me.user?.publicKey ?? null,
      name: me.user?.name ?? "you",
      color: me.user?.color ?? "#888",
      isMe: true,
      idle: false,
      inVoice: !!voiceState?.roomId,
      roleBadge: role.badge,
      roleIcon: role.icon,
      roleLevel: role.level,
    });
  }
  for (const p of peers.value) {
    const pv = (p as any)["atrium-voice"];
    const role = roleFor(p.user?.publicKey ?? null);
    out.push({
      key: `p-${p.clientId}`,
      clientId: p.clientId,
      publicKey: p.user?.publicKey ?? null,
      name: p.user?.name ?? "guest",
      color: p.user?.color ?? "#888",
      isMe: false,
      idle: !!p.idle,
      inVoice: !!pv?.roomId,
      roleBadge: role.badge,
      roleIcon: role.icon,
      roleLevel: role.level,
    });
  }
  return out;
});

const filterText = ref("");

const filtered = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return members.value;
  return members.value.filter((m) => m.name.toLowerCase().includes(q));
});

interface Group {
  id: "voice" | "online" | "idle" | "offline";
  label: string;
  rows: MemberRow[];
}

const groups = computed<Group[]>(() => {
  const voiceGroup: MemberRow[] = [];
  const online: MemberRow[] = [];
  const idle: MemberRow[] = [];
  for (const m of filtered.value) {
    if (m.inVoice) voiceGroup.push(m);
    else if (m.idle) idle.push(m);
    else online.push(m);
  }
  const sortByName = (a: MemberRow, b: MemberRow) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  voiceGroup.sort(sortByName);
  online.sort(sortByName);
  idle.sort(sortByName);
  const out: Group[] = [];
  if (voiceGroup.length) out.push({ id: "voice", label: "In voice", rows: voiceGroup });
  if (online.length) out.push({ id: "online", label: "Online", rows: online });
  if (idle.length) out.push({ id: "idle", label: "Idle", rows: idle });
  return out;
});

const totalOnline = computed(() => members.value.length);

interface HotThread {
  id: string;
  label: string;
  reactionCount: number;
  replyCount: number;
  boardLabel: string | null;
}

const hot = computed<HotThread[]>(() => {
  const forum = activeForum.value;
  if (!forum) return [];
  const cats = nav.categoriesForForum(forum.id);
  const out: HotThread[] = [];
  for (const cat of cats) {
    for (const board of nav.boardsForCategory(cat.id)) {
      for (const thread of nav.threadsForBoard(board.id)) {
        const replies = nav.repliesForThread(thread.id);
        let reactionCount = nav.reactionCountForPost(thread.id);
        for (const r of replies) reactionCount += nav.reactionCountForPost(r.id);
        out.push({
          id: thread.id,
          label: thread.label,
          reactionCount,
          replyCount: replies.length,
          boardLabel: board.label,
        });
      }
    }
  }
  return out
    .sort((a, b) => {
      const r = b.reactionCount - a.reactionCount;
      if (r !== 0) return r;
      return b.replyCount - a.replyCount;
    })
    .slice(0, 4);
});

const onThreadRoute = computed(() => route.path.startsWith("/t/"));

async function copyThreadLink() {
  if (!activeThread.value) return;
  const url = `${window.location.origin}/t/${activeThread.value.id}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.add({ title: "Link copied", description: url, icon: "i-lucide-link" });
  }
  catch {
    toast.add({
      title: "Couldn't copy",
      color: "warning",
      icon: "i-lucide-triangle-alert",
    });
  }
}

// Discord-style: clicking a member name navigates to /u/[pubkey]. The
// AtriumPeerCard takes over for hover-popover on the avatar.
const router = useRouter();
function openProfile(m: MemberRow) {
  if (!m.publicKey) return;
  router.push(`/u/${m.publicKey}`);
}
</script>

<template>
  <aside class="atrium-rrail" aria-label="Member panel">
    <header class="atrium-rrail__head">
      <div class="atrium-rrail__head-row">
        <UIcon name="i-lucide-users" class="size-3.5 text-dimmed" />
        <span class="atrium-rrail__head-title">Members</span>
        <UBadge color="primary" variant="subtle" size="sm" class="ml-auto">
          {{ totalOnline }}
        </UBadge>
      </div>
      <UInput
        v-model="filterText"
        size="sm"
        icon="i-lucide-search"
        placeholder="Filter…"
        class="atrium-rrail__filter"
        :ui="{ base: 'h-7' }"
      />
    </header>

    <div class="atrium-rrail__scroll">
      <section
        v-for="g in groups"
        :key="g.id"
        class="atrium-rrail__group"
      >
        <header class="atrium-rrail__group-head">
          <span
            class="atrium-rrail__group-dot"
            :class="`atrium-rrail__group-dot--${g.id}`"
            aria-hidden="true"
          />
          <span class="atrium-rrail__group-label">
            {{ g.label }} — {{ g.rows.length }}
          </span>
        </header>
        <ul class="atrium-rrail__list">
          <li v-for="m in g.rows" :key="m.key">
            <div class="atrium-rrail__row">
              <AtriumPeerCard
                :name="m.name"
                :color="m.color"
                :client-id="m.clientId"
                :public-key="m.publicKey"
                :is-me="m.isMe"
                :size="24"
              />
              <button
                type="button"
                class="atrium-rrail__row-name"
                :title="`${m.name} · ${m.roleBadge}`"
                @click="openProfile(m)"
              >
                <UIcon
                  v-if="m.roleLevel >= 3"
                  :name="m.roleIcon"
                  class="atrium-rrail__row-role-icon"
                  :class="`atrium-rrail__row-role-icon--lvl${m.roleLevel}`"
                />
                <span
                  class="atrium-rrail__row-text truncate"
                  :style="{ color: m.color }"
                >
                  {{ m.name }}
                </span>
                <span v-if="m.isMe" class="atrium-rrail__row-me">you</span>
                <UIcon
                  v-if="g.id === 'voice'"
                  name="i-lucide-mic"
                  class="size-3 text-primary ml-auto"
                />
                <UIcon
                  v-else-if="m.idle"
                  name="i-lucide-moon"
                  class="size-3 text-dimmed ml-auto"
                />
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="groups.length === 0" class="atrium-rrail__empty">
        <UIcon name="i-lucide-search-x" class="size-5 text-dimmed" />
        <p>No members match "{{ filterText }}".</p>
      </section>

      <section v-if="activeVoiceRoom" class="atrium-rrail__tools">
        <header class="atrium-rrail__tools-head">
          <UIcon name="i-lucide-radio" class="size-3 text-primary" />
          <span>Voice</span>
        </header>
        <NuxtLink :to="`/v/${activeVoiceRoom.id}`" class="atrium-rrail__voice-link">
          <UIcon
            :name="voice.myMuted.value ? 'i-lucide-mic-off' : 'i-lucide-mic'"
            class="size-3.5"
            :class="voice.myMuted.value ? 'text-dimmed' : 'text-primary'"
          />
          <span class="truncate">{{ activeVoiceRoom.label }}</span>
          <UIcon name="i-lucide-arrow-up-right" class="size-3 text-dimmed ml-auto" />
        </NuxtLink>
      </section>

      <section v-if="hot.length && activeForum" class="atrium-rrail__tools">
        <header class="atrium-rrail__tools-head">
          <UIcon name="i-lucide-flame" class="size-3 text-warning" />
          <span>Hot now</span>
        </header>
        <ul class="atrium-rrail__hot">
          <li v-for="t in hot" :key="t.id">
            <NuxtLink :to="`/t/${t.id}`" class="atrium-rrail__hot-link">
              <span class="atrium-rrail__hot-label truncate">{{ t.label }}</span>
              <span class="atrium-rrail__hot-meta">
                <UIcon name="i-lucide-heart" class="size-3" />
                {{ t.reactionCount }}
                <span class="atrium-rrail__hot-dot">·</span>
                <UIcon name="i-lucide-message-circle" class="size-3" />
                {{ t.replyCount }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section v-if="onThreadRoute && activeThread" class="atrium-rrail__tools">
        <header class="atrium-rrail__tools-head">
          <UIcon name="i-lucide-link-2" class="size-3 text-dimmed" />
          <span>Share</span>
        </header>
        <button
          type="button"
          class="atrium-rrail__share"
          @click="copyThreadLink"
        >
          <UIcon name="i-lucide-copy" class="size-3.5" />
          <span>Copy thread link</span>
        </button>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.atrium-rrail {
  width: 232px;
  flex-shrink: 0;
  background: var(--ui-bg-elevated);
  border-left: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.atrium-rrail__head {
  padding: 0.65rem 0.7rem 0.55rem;
  border-bottom: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.atrium-rrail__head-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.atrium-rrail__head-title {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}
.atrium-rrail__filter {
  width: 100%;
}
.atrium-rrail__scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0.55rem 0.45rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.atrium-rrail__group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.atrium-rrail__group-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.4rem;
}
.atrium-rrail__group-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--ui-text-dimmed);
  flex-shrink: 0;
}
.atrium-rrail__group-dot--voice {
  background: var(--ui-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-primary) 25%, transparent);
}
.atrium-rrail__group-dot--online {
  background: var(--ui-color-success-500, #10b981);
}
.atrium-rrail__group-dot--idle {
  background: var(--ui-color-warning-500, #f59e0b);
  opacity: 0.7;
}
.atrium-rrail__group-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}
.atrium-rrail__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}
.atrium-rrail__row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.25rem 0.4rem;
  border-radius: var(--atrium-radius-sm, 0.4rem);
  transition: background 0.12s ease;
}
.atrium-rrail__row:hover {
  background: color-mix(in srgb, var(--ui-primary) 6%, transparent);
}
.atrium-rrail__row-name {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}
.atrium-rrail__row-text {
  font-size: 0.825rem;
  font-weight: 500;
  min-width: 0;
}
.atrium-rrail__row-role-icon {
  width: 0.85rem;
  height: 0.85rem;
  flex-shrink: 0;
}
.atrium-rrail__row-role-icon--lvl3 {
  color: var(--ui-color-warning-500, #f59e0b);
}
.atrium-rrail__row-role-icon--lvl4 {
  color: var(--ui-primary);
}
.atrium-rrail__row-role-icon--lvl5 {
  color: gold;
  filter: drop-shadow(0 0 4px color-mix(in srgb, gold 60%, transparent));
}
.atrium-rrail__row-me {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
  padding: 0.05rem 0.3rem;
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
}
.atrium-rrail__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 1.4rem 0.5rem;
  text-align: center;
  color: var(--ui-text-dimmed);
  font-size: 0.75rem;
}
.atrium-rrail__tools {
  border-top: 1px solid var(--ui-border);
  padding-top: 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.atrium-rrail__tools-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.4rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}
.atrium-rrail__voice-link,
.atrium-rrail__share,
.atrium-rrail__hot-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: var(--atrium-radius-sm, 0.4rem);
  text-decoration: none;
  color: inherit;
  font-size: 0.8rem;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  width: 100%;
  font-family: inherit;
}
.atrium-rrail__voice-link:hover,
.atrium-rrail__share:hover,
.atrium-rrail__hot-link:hover {
  background: color-mix(in srgb, var(--ui-primary) 7%, transparent);
}
.atrium-rrail__hot {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.atrium-rrail__hot-link {
  flex-direction: column;
  align-items: stretch;
  gap: 0.2rem;
  padding: 0.4rem 0.55rem;
}
.atrium-rrail__hot-label {
  font-size: 0.8rem;
  font-weight: 500;
}
.atrium-rrail__hot-meta {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  font-variant-numeric: tabular-nums;
}
.atrium-rrail__hot-dot {
  opacity: 0.5;
  margin: 0 0.1rem;
}
</style>
