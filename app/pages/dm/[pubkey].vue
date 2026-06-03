<script setup lang="ts">
// Full-page direct message. Deep-linkable via /dm/[pubkey] for long-form
// conversations; the modal stays for quick replies launched from peer cards.

const route = useRoute();
const router = useRouter();
const { publicKeyB64, userName } = useAbracadabra();
const { peers } = useAwarenessPeers();
const dm = useAtriumDM();
const toast = useToast();

const recipientPubkey = computed(() => route.params.pubkey as string);

const peer = computed(() =>
  peers.value.find((p) => p.user?.publicKey === recipientPubkey.value),
);

const recipientName = computed(() => {
  if (peer.value?.user?.name) return peer.value.user.name;
  if (!recipientPubkey.value) return "Unknown";
  return `${recipientPubkey.value.slice(0, 8)}…`;
});

const recipientColor = computed(() => peer.value?.user?.color ?? "#888");
const isOnline = computed(() => !!peer.value && !peer.value.idle);
const isMe = computed(() => recipientPubkey.value === publicKeyB64.value);

const channelKey = computed(() => {
  if (!publicKeyB64.value || !recipientPubkey.value) return "";
  return buildDmChannelId(publicKeyB64.value, recipientPubkey.value);
});

const channel = computed(() =>
  channelKey.value ? useChatChannel(channelKey.value) : null,
);

const messages = computed(() => channel.value?.messages.value ?? []);
const typingUsers = computed(() => channel.value?.typingUsers.value ?? []);

function send(content: string) {
  channel.value?.send(content);
}
function onTyping() {
  channel.value?.typing();
}

const mentionUsers = computed(() => {
  return peers.value.map((p) => ({
    id: p.user?.publicKey ?? String(p.clientId),
    label: p.user?.name ?? "guest",
    color: p.user?.color,
  }));
});

function copyLink() {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}/dm/${recipientPubkey.value}`;
  navigator.clipboard.writeText(url).then(() => {
    toast.add({ title: "DM link copied", description: url, icon: "i-lucide-link" });
  }).catch(() => {});
}

function openInModal() {
  // Close the page (back to list) then pop the modal. Useful when the user
  // wants the conversation to float over their browsing without taking the
  // main column.
  router.push("/dm").then(() => {
    dm.openWith({
      pubkey: recipientPubkey.value,
      name: recipientName.value,
      color: recipientColor.value,
    });
  });
}

// Self-DM is meaningless — bounce to the list.
watch(isMe, (v) => {
  if (v) {
    toast.add({
      title: "Can't DM yourself",
      icon: "i-lucide-triangle-alert",
      color: "warning",
    });
    router.push("/dm");
  }
}, { immediate: true });

// Mark active so unread clears + history streams in.
onMounted(() => { channel.value?.focus(); });
onBeforeUnmount(() => { channel.value?.blur(); });

useHead(() => ({ title: `${recipientName.value} · DM · Atrium` }));
</script>

<template>
  <div class="atrium-dmpage">
    <ClientOnly>
      <header class="atrium-dmpage__head">
        <AtriumPeerCard
          :name="recipientName"
          :color="recipientColor"
          :public-key="recipientPubkey"
          :client-id="peer?.clientId ?? null"
          :size="40"
        />
        <div class="atrium-dmpage__head-text">
          <h1 class="atrium-dmpage__title">{{ recipientName }}</h1>
          <p class="atrium-dmpage__sub">
            <span v-if="isOnline" class="text-success">Online</span>
            <span v-else class="text-dimmed">
              Offline — messages deliver when {{ recipientName }} reconnects
            </span>
          </p>
        </div>

        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-link"
          @click="copyLink"
        >
          Copy DM link
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-external-link"
          @click="openInModal"
        >
          Open as modal
        </UButton>
        <UButton
          :to="`/u/${recipientPubkey}`"
          color="primary"
          variant="soft"
          size="sm"
          icon="i-lucide-user"
        >
          View profile
        </UButton>
      </header>

      <section class="atrium-dmpage__body">
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
          empty-subtext="Direct messages stay between you two."
          @send="send"
          @typing="onTyping"
        />
      </section>

      <template #fallback>
        <div class="atrium-dmpage__loading">
          <UIcon name="i-lucide-loader-circle" class="size-5 text-dimmed animate-spin" />
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.atrium-dmpage {
  height: 100%;
  display: flex;
  flex-direction: column;
  max-width: 56rem;
  margin: 0 auto;
  width: 100%;
  padding: 1.25rem 1.25rem 0;
}
.atrium-dmpage__head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid var(--ui-border);
  flex-wrap: wrap;
}
.atrium-dmpage__head-text {
  flex: 1;
  min-width: 12rem;
}
.atrium-dmpage__title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}
.atrium-dmpage__sub {
  font-size: 0.78rem;
  margin: 0.1rem 0 0;
}
.atrium-dmpage__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 0.5rem;
}
.atrium-dmpage__loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
