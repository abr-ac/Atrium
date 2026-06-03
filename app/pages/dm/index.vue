<script setup lang="ts">
// Direct messages list — every channel keyed `dm:<sortedPair>` involving
// the current user surfaces here with last message preview + unread count.
// Clicking a row opens the global DM modal (provided by the layout).

useHead({ title: "Direct messages · Atrium" });

const { channels, totalUnreadCount, buildDmChannelId } = useChat();
const { publicKeyB64 } = useAbracadabra();
const { peers } = useAwarenessPeers();
const dm = useAtriumDM();
const router = useRouter();

interface DMRow {
  channelKey: string;
  otherPubkey: string;
  name: string;
  color: string;
  online: boolean;
  lastMessage: string;
  lastTimestamp: number;
  unreadCount: number;
}

const rows = computed<DMRow[]>(() => {
  const me = publicKeyB64.value;
  if (!me) return [];
  const out: DMRow[] = [];
  for (const [key, ch] of Object.entries(channels.value)) {
    if (!key.startsWith("dm:")) continue;
    const pair = key.slice(3).split(":");
    if (pair.length !== 2 || !pair.includes(me)) continue;
    const other = pair[0] === me ? pair[1]! : pair[0]!;
    const peer = peers.value.find((p) => p.user?.publicKey === other);
    out.push({
      channelKey: key,
      otherPubkey: other,
      name: peer?.user?.name ?? `${other.slice(0, 8)}…`,
      color: peer?.user?.color ?? "#888",
      online: !!peer && !peer.idle,
      lastMessage: ch.lastMessage?.content ?? "(no messages yet)",
      lastTimestamp: ch.lastMessage?.timestamp ?? 0,
      unreadCount: ch.unreadCount ?? 0,
    });
  }
  return out.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
});

// Single-tap opens the modal (quick reply). Long-press / shift-click goes
// to the dedicated page for a deep-link or long session.
function openDM(r: DMRow, ev?: MouseEvent) {
  if (ev?.shiftKey) {
    router.push(`/dm/${r.otherPubkey}`);
    return;
  }
  dm.openWith({ pubkey: r.otherPubkey, name: r.name, color: r.color });
}

function openDMPage(r: DMRow) {
  router.push(`/dm/${r.otherPubkey}`);
}

// New-DM peer picker. Opens the same picker UX used by @-mentions, then
// hands the chosen peer to the global DM modal via dm.openWith().
const pickerOpen = ref(false);

function newDM() {
  pickerOpen.value = true;
}

function onPeerSelected(peer: { pubkey: string; name: string; color: string | null }) {
  if (peer.pubkey === publicKeyB64.value) return;
  dm.openWith({
    pubkey: peer.pubkey,
    name: peer.name,
    color: peer.color ?? "#888",
  });
}

function relativeTime(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

function trimMessage(msg: string, max = 90): string {
  const clean = msg.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}
</script>

<template>
  <div class="atrium-dm-list">
    <ClientOnly>
      <header class="atrium-dm-list__head">
        <UIcon name="i-lucide-mail" class="size-7 text-primary" />
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-semibold leading-tight">Direct messages</h1>
          <p class="text-sm text-dimmed mt-1">
            <template v-if="totalUnreadCount > 0">
              {{ totalUnreadCount }} unread across {{ rows.length }} conversation{{ rows.length === 1 ? '' : 's' }}.
            </template>
            <template v-else-if="rows.length > 0">
              {{ rows.length }} active {{ rows.length === 1 ? 'conversation' : 'conversations' }}.
            </template>
            <template v-else>
              No DMs yet. Hover any member's avatar to start one.
            </template>
          </p>
        </div>
        <UButton
          color="primary"
          variant="soft"
          size="sm"
          icon="i-lucide-plus"
          @click="newDM"
        >
          New DM
        </UButton>
      </header>

      <section v-if="rows.length === 0" class="atrium-dm-list__empty">
        <UIcon name="i-lucide-mail-question" class="size-10 text-dimmed" />
        <p class="atrium-dm-list__empty-title">Your inbox is empty</p>
        <p class="atrium-dm-list__empty-sub">
          DMs let you talk one-on-one outside the public forums. Hover any peer's
          avatar in the member panel and hit "DM" to start a conversation.
        </p>
      </section>

      <ul v-else class="atrium-dm-list__rows">
        <li
          v-for="r in rows"
          :key="r.channelKey"
          class="atrium-dm-list__row"
          :class="{ 'atrium-dm-list__row--unread': r.unreadCount > 0 }"
        >
          <button
            type="button"
            class="atrium-dm-list__btn"
            :title="`Click to open in modal · Shift+click for full page`"
            @click="openDM(r, $event)"
            @contextmenu.prevent="openDMPage(r)"
          >
            <AtriumAvatar
              :name="r.name"
              :color="r.color"
              :size="40"
              :status="r.online ? 'connected' : 'disconnected'"
            />
            <div class="atrium-dm-list__body">
              <p class="atrium-dm-list__row-title">
                <span class="truncate" :style="{ color: r.color }">{{ r.name }}</span>
                <span class="atrium-dm-list__row-time">
                  {{ relativeTime(r.lastTimestamp) }}
                </span>
              </p>
              <p class="atrium-dm-list__row-snippet">
                {{ trimMessage(r.lastMessage) }}
              </p>
            </div>
            <UBadge
              v-if="r.unreadCount > 0"
              color="primary"
              variant="solid"
              size="sm"
              class="atrium-dm-list__row-badge"
            >
              {{ r.unreadCount }}
            </UBadge>
          </button>
        </li>
      </ul>

      <template #fallback>
        <div class="atrium-dm-list__loading">
          <UIcon name="i-lucide-loader-circle" class="size-5 text-dimmed animate-spin" />
        </div>
      </template>
    </ClientOnly>

    <AtriumMentionPicker
      v-model:open="pickerOpen"
      @select="onPeerSelected"
    />
  </div>
</template>

<style scoped>
.atrium-dm-list {
  max-width: 56rem;
  margin: 0 auto;
  width: 100%;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.atrium-dm-list__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.atrium-dm-list__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-md, 0.65rem);
  overflow: hidden;
  background: var(--ui-bg);
}
.atrium-dm-list__row + .atrium-dm-list__row {
  border-top: 1px solid var(--ui-border);
}
.atrium-dm-list__row--unread {
  background: color-mix(in srgb, var(--ui-primary) 5%, transparent);
}
.atrium-dm-list__btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  background: transparent;
  border: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition: background 0.15s ease;
}
.atrium-dm-list__btn:hover {
  background: color-mix(in srgb, var(--ui-primary) 6%, transparent);
}
.atrium-dm-list__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.atrium-dm-list__row-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.95rem;
  margin: 0;
}
.atrium-dm-list__row-time {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.atrium-dm-list__row-snippet {
  font-size: 0.825rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}
.atrium-dm-list__row--unread .atrium-dm-list__row-snippet {
  color: var(--ui-text);
}
.atrium-dm-list__row-badge {
  flex-shrink: 0;
}
.atrium-dm-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding: 3.5rem 1rem;
  border: 1px dashed var(--ui-border);
  border-radius: var(--atrium-radius-lg, 1rem);
  text-align: center;
}
.atrium-dm-list__empty-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
.atrium-dm-list__empty-sub {
  font-size: 0.875rem;
  color: var(--ui-text-dimmed);
  margin: 0;
  max-width: 28rem;
  line-height: 1.5;
}
.atrium-dm-list__loading {
  display: flex;
  justify-content: center;
  padding: 4rem;
}
</style>
