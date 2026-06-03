<script setup lang="ts">
// AtriumPeerCard — hover-popover showing a peer's identity card. Wraps any
// trigger via the default slot; on hover (desktop) or click (mobile) it
// reveals avatar, display name, pubkey short, status, in-thread post count,
// and stub CTAs for DM / Follow / Profile.

const props = withDefaults(defineProps<{
  name: string;
  color?: string;
  publicKey?: string | null;
  /** Awareness clientId if known — used to derive online/idle status. */
  clientId?: number | null;
  /** Optional role label (Editor / Owner / Observer). */
  role?: string | null;
  /** When true, the trigger renders with a primary-tinted "you" hint. */
  isMe?: boolean;
  /** Avatar size for the trigger; the card itself uses a larger avatar. */
  size?: number;
  /** Use click instead of hover (good for tight cursor-dot triggers). */
  clickMode?: boolean;
}>(), {
  color: "#888",
  publicKey: null,
  clientId: null,
  role: null,
  isMe: false,
  size: 32,
  clickMode: false,
});

const { peers } = useAwarenessPeers();
const route = useRoute();
const { doc } = useAbracadabra();

const status = computed<"connected" | "idle" | "disconnected">(() => {
  if (props.isMe) return "connected";
  if (props.clientId == null) return "disconnected";
  const p = peers.value.find((x) => x.clientId === props.clientId);
  if (!p) return "disconnected";
  if (p.idle) return "idle";
  return "connected";
});

const statusLabel = computed(() => {
  if (status.value === "connected") return "Online now";
  if (status.value === "idle") return "Idle";
  return "Last seen recently";
});

// Count this peer's posts in the active thread (only when /t/[id]).
const threadId = computed(() => {
  if (!route.path.startsWith("/t/")) return null;
  return (route.params.id as string) ?? null;
});

const tree = threadId.value
  ? useChildTree(doc, threadId.value)
  : null;

const postsInThread = computed(() => {
  if (!tree || !threadId.value || !props.publicKey) return 0;
  let n = 0;
  for (const e of tree.entries.value) {
    if (e.type === "reaction") continue;
    const meta = (e.meta ?? {}) as Record<string, unknown>;
    if (meta.author === props.publicKey) n += 1;
  }
  return n;
});

const reputation = useAtriumReputation(() => props.publicKey);

const shortKey = computed(() => {
  if (!props.publicKey) return "";
  return props.publicKey.slice(0, 8) + "…";
});

const dm = useAtriumDM();
function openDM() {
  if (!props.publicKey || props.isMe) return;
  dm.openWith({
    pubkey: props.publicKey,
    name: props.name,
    color: props.color,
  });
}

const toast = useToast();

function copyKey() {
  if (!props.publicKey) return;
  navigator.clipboard.writeText(props.publicKey).then(() => {
    toast.add({
      title: "Pubkey copied",
      description: shortKey.value,
      icon: "i-lucide-key",
    });
  }).catch(() => {});
}
</script>

<template>
  <UPopover
    :mode="clickMode ? 'click' : 'hover'"
    :open-delay="180"
    :close-delay="120"
    :content="{ side: 'right', align: 'start' }"
  >
    <slot>
      <button type="button" class="atrium-peercard__trigger">
        <AtriumAvatar :name="name" :color="color" :size="size" :mine="isMe" />
      </button>
    </slot>
    <template #content>
      <article class="atrium-peercard">
        <header class="atrium-peercard__head">
          <AtriumAvatar
            :name="name"
            :color="color"
            :mine="isMe"
            :size="48"
            :status="status"
          />
          <div class="atrium-peercard__head-text">
            <h3 class="atrium-peercard__name">
              {{ name }}
              <span v-if="isMe" class="atrium-peercard__you">(you)</span>
            </h3>
            <p class="atrium-peercard__status">
              <span
                class="atrium-peercard__dot"
                :class="`atrium-peercard__dot--${status}`"
                aria-hidden="true"
              />
              {{ statusLabel }}
            </p>
          </div>
        </header>

        <div
          v-if="publicKey"
          class="atrium-peercard__rep"
          :class="`atrium-peercard__rep--lvl${reputation.level}`"
          :title="`${reputation.breakdown.threads} threads · ${reputation.breakdown.replies} replies · ${reputation.breakdown.reactionsReceived} reactions received`"
        >
          <UIcon :name="reputation.badgeIcon" class="size-3.5 atrium-peercard__rep-icon" />
          <span class="atrium-peercard__rep-badge">{{ reputation.badge }}</span>
          <span class="atrium-peercard__rep-spacer" />
          <template v-if="reputation.karma > 0">
            <span class="atrium-peercard__rep-num">{{ reputation.karma }}</span>
            <span class="atrium-peercard__rep-unit">karma</span>
          </template>
        </div>

        <dl v-if="publicKey || role || postsInThread > 0" class="atrium-peercard__stats">
          <div v-if="publicKey" class="atrium-peercard__stat">
            <dt>Pubkey</dt>
            <dd>
              <button
                type="button"
                class="atrium-peercard__key"
                @click="copyKey"
              >
                <code>{{ shortKey }}</code>
                <UIcon name="i-lucide-copy" class="size-3" />
              </button>
            </dd>
          </div>
          <div v-if="role" class="atrium-peercard__stat">
            <dt>Role</dt>
            <dd>{{ role }}</dd>
          </div>
          <div v-if="postsInThread > 0" class="atrium-peercard__stat">
            <dt>In this thread</dt>
            <dd>{{ postsInThread }} {{ postsInThread === 1 ? "post" : "posts" }}</dd>
          </div>
        </dl>

        <footer class="atrium-peercard__actions">
          <UButton
            v-if="publicKey"
            :to="`/u/${publicKey}`"
            color="primary"
            variant="soft"
            size="xs"
            icon="i-lucide-user"
            block
          >
            View profile
          </UButton>
          <div class="atrium-peercard__action-row">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-message-square"
              :disabled="isMe || !publicKey"
              :title="isMe ? 'Cannot DM yourself' : 'Direct message'"
              block
              @click="openDM"
            >
              DM
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-user-plus"
              :disabled="isMe"
              :title="isMe ? 'Cannot follow yourself' : 'Follow — coming soon'"
              block
            >
              Follow
            </UButton>
          </div>
        </footer>
      </article>
    </template>
  </UPopover>
</template>

<style scoped>
.atrium-peercard__trigger {
  display: inline-flex;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 0.5rem;
}
.atrium-peercard__trigger:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ui-primary) 60%, transparent);
  outline-offset: 2px;
}
</style>

<style>
.atrium-peercard {
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.85rem 0.85rem 0.75rem;
}
.atrium-peercard__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.atrium-peercard__head-text {
  min-width: 0;
  flex: 1;
}
.atrium-peercard__name {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  min-width: 0;
}
.atrium-peercard__you {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--ui-text-dimmed);
}
.atrium-peercard__status {
  font-size: 0.75rem;
  color: var(--ui-text-dimmed);
  margin: 0.15rem 0 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.atrium-peercard__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 9999px;
  background: var(--ui-text-dimmed);
}
.atrium-peercard__dot--connected {
  background: var(--ui-color-success-500, #10b981);
}
.atrium-peercard__dot--idle {
  background: var(--ui-color-warning-500, #f59e0b);
}
.atrium-peercard__dot--disconnected {
  background: var(--ui-text-dimmed);
}
.atrium-peercard__rep {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.55rem;
  border-radius: var(--atrium-radius-sm, 0.4rem);
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-primary) 22%, transparent);
  font-size: 0.75rem;
}
.atrium-peercard__rep-badge {
  font-weight: 600;
  color: var(--ui-primary);
}
.atrium-peercard__rep--lvl5 {
  border-color: color-mix(in srgb, gold 50%, transparent);
  background: color-mix(in srgb, gold 10%, transparent);
}
.atrium-peercard__rep--lvl5 .atrium-peercard__rep-badge,
.atrium-peercard__rep--lvl5 .atrium-peercard__rep-icon {
  color: gold;
}
.atrium-peercard__rep--lvl0 {
  background: color-mix(in srgb, var(--ui-text-dimmed) 6%, transparent);
  border-color: var(--ui-border);
}
.atrium-peercard__rep--lvl0 .atrium-peercard__rep-badge,
.atrium-peercard__rep--lvl0 .atrium-peercard__rep-icon {
  color: var(--ui-text-dimmed);
}
.atrium-peercard__rep-spacer {
  flex: 1;
}
.atrium-peercard__rep-num {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.atrium-peercard__rep-unit {
  color: var(--ui-text-dimmed);
  font-size: 0.7rem;
}
.atrium-peercard__stats {
  margin: 0;
  border-top: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
  padding: 0.55rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.atrium-peercard__stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.8rem;
}
.atrium-peercard__stat dt {
  color: var(--ui-text-dimmed);
}
.atrium-peercard__stat dd {
  margin: 0;
  font-weight: 500;
}
.atrium-peercard__key {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: transparent;
  border: none;
  cursor: pointer;
  color: inherit;
  padding: 0;
  font: inherit;
}
.atrium-peercard__key code {
  font-family: var(--font-mono, ui-monospace);
  font-size: 0.75rem;
  padding: 0.05rem 0.3rem;
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--ui-text-dimmed) 12%, transparent);
}
.atrium-peercard__key:hover code {
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
  color: var(--ui-primary);
}
.atrium-peercard__actions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.atrium-peercard__action-row {
  display: flex;
  gap: 0.35rem;
}
</style>
