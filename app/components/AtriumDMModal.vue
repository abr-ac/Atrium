<script setup lang="ts">
// AtriumDMModal — minimal direct-message UModal between current user and a
// target pubkey. buildDmChannelId() derives the DM doc id from the sorted
// pubkey pair; ensureDmChannel() creates the backing doc on first open.

const props = defineProps<{
  open: boolean;
  recipientPubkey: string;
  recipientName: string;
  recipientColor?: string;
}>();

const emit = defineEmits<{ "update:open": [v: boolean] }>();

const { publicKeyB64, userName } = useAbracadabra();
const { peers } = useAwarenessPeers();

const channelId = computed(() => {
  if (!publicKeyB64.value || !props.recipientPubkey) return "";
  return buildDmChannelId(publicKeyB64.value, props.recipientPubkey);
});

const channel = computed(() =>
  channelId.value ? useChatChannel(channelId.value) : null,
);

// The DM's backing document must EXIST (with Editor rows for both participants)
// before the first send, or `messages:send` is refused with
// `not found: document <id> not found` and the message silently vanishes.
// Creation runs on our Nitro route as the service account — a member can't
// create a top-level doc under this forum's posture. See useAtriumDmChannel.
const dmChannel = useAtriumDmChannel();
watch([() => publicKeyB64.value, () => props.recipientPubkey], async ([me, other]) => {
  if (!me || !other || me === other) return;
  await dmChannel.ensure(other);
}, { immediate: true });


const messages = computed(() => channel.value?.messages.value ?? []);
// `useChatChannel().typingUsers` yields NAMES (string[]) while <AChatPanel>
// takes `TypingUser[]` ({ name, avatarStyle? }). Adapt here rather than
// passing strings, which rendered blank names in the typing indicator.
const typingUsers = computed(() =>
  (channel.value?.typingUsers.value ?? []).map((name: string) => ({ name })),
);

function send(content: string) {
  channel.value?.send(content);
}
function onTyping() {
  channel.value?.typing();
}

const recipientIsOnline = computed(() => {
  return peers.value.some((p) => p.user?.publicKey === props.recipientPubkey);
});

// Map peer pubkeys to display names for the panel's mention/byline rendering.
// <AChatPanel> takes `ChatMentionUser[]` = { id, name, isAgent? }. The old
// `{ id, label, color }` shape left every mention suggestion unnamed.
const mentionUsers = computed(() => {
  return peers.value.map((p) => ({
    id: p.user?.publicKey ?? String(p.clientId),
    name: p.user?.name ?? "guest",
  }));
});

function close() {
  emit("update:open", false);
  channel.value?.blur();
}

// Focus channel on open so unread state clears.
watch(
  () => props.open,
  (next) => {
    if (next) channel.value?.focus();
  },
);
</script>

<template>
  <UModal
    :open="open"
    :ui="{ content: 'max-w-2xl atrium-dm-modal__content' }"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="atrium-dm">
        <header class="atrium-dm__head">
          <AtriumAvatar
            :name="recipientName"
            :color="recipientColor"
            :size="36"
            :status="recipientIsOnline ? 'connected' : 'disconnected'"
          />
          <div class="atrium-dm__head-text">
            <h2 class="atrium-dm__title">{{ recipientName }}</h2>
            <p class="atrium-dm__sub">
              <span v-if="recipientIsOnline" class="text-success">Online</span>
              <span v-else class="text-dimmed">Offline — message will deliver when they reconnect</span>
            </p>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-x"
            square
            aria-label="Close"
            @click="close"
          />
        </header>

        <div class="atrium-dm__body">
          <ClientOnly>
            <AChatPanel
              :label="recipientName"
              :messages="messages"
              :current-user-id="publicKeyB64"
              :typing-users="typingUsers"
              :mention-users="mentionUsers"
              :placeholder="`Message ${recipientName}…`"
              autofocus
              empty-icon="i-lucide-mail"
              :empty-text="`Start a chat with ${recipientName}`"
              empty-subtext="Direct messages stay between you two. Encrypted-at-rest still in progress for Phase 7."
              @send="send"
              @typing="onTyping"
            />
            <template #fallback>
              <div class="atrium-dm__loading">
                <UIcon
                  name="i-lucide-loader-circle"
                  class="size-5 text-dimmed animate-spin"
                />
              </div>
            </template>
          </ClientOnly>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style>
.atrium-dm-modal__content {
  max-width: 42rem !important;
}
</style>

<style scoped>
.atrium-dm {
  display: flex;
  flex-direction: column;
  height: 70vh;
  min-height: 28rem;
  max-height: 38rem;
}
.atrium-dm__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--ui-border);
}
.atrium-dm__head-text {
  flex: 1;
  min-width: 0;
}
.atrium-dm__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
.atrium-dm__sub {
  font-size: 0.75rem;
  margin: 0.15rem 0 0;
  color: var(--ui-text-dimmed);
}
.atrium-dm__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.atrium-dm__loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
