<script setup lang="ts">
// Settings — sectioned preferences page. Splits into Profile / Appearance /
// Notifications / Following / Devices / Data. Each section is a card with
// inline controls. Stays a single page (rather than tabbed) so deep links
// like /settings#following are useful.

const abra = useAbracadabra();
const colorMode = useColorMode();
const density = useAtriumDensity();
const follows = useAtriumFollows();
const nav = useAtriumNav();
const toast = useToast();
const router = useRouter();

const draftName = ref(abra.userName.value);
const namePersisting = ref(false);
watch(() => abra.userName.value, (v) => {
  if (!namePersisting.value) draftName.value = v;
});

async function saveName() {
  const next = draftName.value.trim();
  if (!next || next === abra.userName.value) return;
  namePersisting.value = true;
  try {
    abra.setUserName(next);
    toast.add({
      title: "Name saved",
      description: `You'll appear as "${next}" to other peers.`,
      icon: "i-lucide-check-circle-2",
    });
  }
  finally {
    namePersisting.value = false;
  }
}

const SWATCHES = [
  "orange", "amber", "yellow", "lime", "emerald", "teal", "cyan", "sky",
  "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "red",
] as const;

function pickColor(c: string) {
  abra.setUserColor(c);
}

async function copyPublicKey() {
  try {
    await navigator.clipboard.writeText(abra.publicKeyB64.value);
    toast.add({
      title: "Public key copied",
      icon: "i-lucide-key",
    });
  }
  catch {}
}

const followedThreads = computed(() => {
  return follows.follows.value
    .map((id) => {
      const entry = nav.allEntries.value.find((e) => e.id === id);
      return entry ? { id, label: entry.label, type: entry.type } : null;
    })
    .filter((x): x is { id: string; label: string; type: string | undefined } => x !== null);
});

const orphanedFollows = computed(() =>
  follows.follows.value.filter((id) => !nav.allEntries.value.find((e) => e.id === id)),
);

function unfollow(id: string) {
  follows.unfollow(id);
  toast.add({ title: "Unfollowed", icon: "i-lucide-heart-off" });
}

function pruneOrphaned() {
  for (const id of orphanedFollows.value) follows.unfollow(id);
  toast.add({
    title: `Pruned ${orphanedFollows.value.length} orphaned`,
    icon: "i-lucide-trash-2",
  });
}

// Notification preferences — localStorage-backed for now. Server-side mute
// rules will come in a later round.
const notifyPrefs = useLocalStorage("atrium:notify-prefs", {
  replies: true,
  mentions: true,
  reactions: true,
  voiceJoin: true,
  sound: false,
});

// Local-data nukes. Each clears one persisted scope and toasts the result.
function clearFollows() {
  if (!confirmOpen.value) {
    pendingAction.value = "follows";
    confirmOpen.value = true;
  }
}
function clearDrafts() {
  pendingAction.value = "drafts";
  confirmOpen.value = true;
}
function clearScroll() {
  pendingAction.value = "scroll";
  confirmOpen.value = true;
}

const confirmOpen = ref(false);
const pendingAction = ref<"follows" | "drafts" | "scroll" | null>(null);

const confirmCopy = computed(() => {
  switch (pendingAction.value) {
    case "follows":
      return {
        title: "Clear all follows?",
        body: `Removes ${follows.follows.value.length} followed thread${follows.follows.value.length === 1 ? "" : "s"} from this browser. Doesn't affect peers.`,
        cta: "Clear follows",
      };
    case "drafts":
      return {
        title: "Discard local drafts?",
        body: "Removes every draft reply / thread cached in this browser. Drafts saved as tree entries (with meta.draft=true) are not affected.",
        cta: "Discard drafts",
      };
    case "scroll":
      return {
        title: "Reset scroll positions?",
        body: "Clears restored scroll positions for every thread you've visited. Doesn't affect content.",
        cta: "Reset scroll",
      };
    default:
      return { title: "", body: "", cta: "" };
  }
});

function commitClear() {
  if (typeof window === "undefined") return;
  switch (pendingAction.value) {
    case "follows":
      follows.follows.value = [];
      toast.add({ title: "Follows cleared", icon: "i-lucide-trash-2" });
      break;
    case "drafts":
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("atrium:draft:")) localStorage.removeItem(k);
      });
      toast.add({ title: "Drafts cleared", icon: "i-lucide-trash-2" });
      break;
    case "scroll":
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith("atrium:thread-scroll:")) sessionStorage.removeItem(k);
      });
      toast.add({ title: "Scroll positions reset", icon: "i-lucide-arrow-up" });
      break;
  }
  confirmOpen.value = false;
  pendingAction.value = null;
}

useHead({ title: "Settings · Atrium" });
</script>

<template>
  <div class="atrium-settings">
    <header class="atrium-settings__head">
      <UIcon name="i-lucide-settings" class="size-7 text-primary" />
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold leading-tight">Settings</h1>
        <p class="text-sm text-dimmed mt-1">
          Preferences, identity, and local data live here. Most things are
          shared with peers; a few are browser-local.
        </p>
      </div>
    </header>

    <ClientOnly>
      <!-- ── Profile ───────────────────────────────────────────────────── -->
      <section id="profile" class="atrium-settings__section">
        <div class="atrium-settings__section-head">
          <UIcon name="i-lucide-user" class="size-4 text-primary" />
          <h2>Profile</h2>
        </div>
        <div class="atrium-settings__row">
          <label for="atrium-name" class="atrium-settings__label">
            Display name
            <span class="atrium-settings__hint">
              Visible to every peer in posts, presence, reactions.
            </span>
          </label>
          <div class="flex gap-2 max-w-md w-full">
            <UInput
              id="atrium-name"
              v-model="draftName"
              size="md"
              :loading="namePersisting"
              class="flex-1"
              @keydown.enter="saveName"
            />
            <UButton
              color="primary"
              variant="soft"
              :disabled="!draftName.trim() || draftName.trim() === abra.userName.value"
              @click="saveName"
            >
              Save
            </UButton>
          </div>
        </div>
        <div class="atrium-settings__row">
          <label class="atrium-settings__label">
            Accent color
            <span class="atrium-settings__hint">
              Tints your avatar and the primary chrome while you're signed in.
            </span>
          </label>
          <div class="atrium-settings__swatches">
            <button
              v-for="c in SWATCHES"
              :key="c"
              type="button"
              class="atrium-settings__swatch"
              :class="{
                'atrium-settings__swatch--active': abra.userColorName.value === c,
              }"
              :style="{ background: `var(--ui-color-${c}-500, var(--color-${c}-500))` }"
              :aria-label="c"
              :title="c"
              @click="pickColor(c)"
            />
          </div>
        </div>
        <div class="atrium-settings__row">
          <label class="atrium-settings__label">
            Public key
            <span class="atrium-settings__hint">
              Your stable identity across sessions. Shareable.
            </span>
          </label>
          <div class="atrium-settings__row-action">
            <code class="atrium-settings__pubkey truncate">
              {{ abra.publicKeyB64.value }}
            </code>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-copy"
              @click="copyPublicKey"
            >
              Copy
            </UButton>
          </div>
        </div>
      </section>

      <!-- ── Appearance ────────────────────────────────────────────────── -->
      <section id="appearance" class="atrium-settings__section">
        <div class="atrium-settings__section-head">
          <UIcon name="i-lucide-palette" class="size-4 text-primary" />
          <h2>Appearance</h2>
        </div>
        <div class="atrium-settings__row">
          <label class="atrium-settings__label">
            Color mode
            <span class="atrium-settings__hint">
              Dark mode keeps reads gentle; light is great for daytime.
            </span>
          </label>
          <USelect
            v-model="colorMode.preference"
            :items="[
              { label: 'System default', value: 'system' },
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
            ]"
            value-attribute="value"
            class="w-44"
          />
        </div>
        <div class="atrium-settings__row">
          <label class="atrium-settings__label">
            Density
            <span class="atrium-settings__hint">
              Compact stacks more on screen; comfortable breathes.
            </span>
          </label>
          <UButtonGroup>
            <UButton
              :color="!density.isCompact.value ? 'primary' : 'neutral'"
              :variant="!density.isCompact.value ? 'soft' : 'ghost'"
              icon="i-lucide-rows-2"
              @click="!density.isCompact.value || density.toggle()"
            >
              Comfortable
            </UButton>
            <UButton
              :color="density.isCompact.value ? 'primary' : 'neutral'"
              :variant="density.isCompact.value ? 'soft' : 'ghost'"
              icon="i-lucide-rows-3"
              @click="density.isCompact.value || density.toggle()"
            >
              Compact
            </UButton>
          </UButtonGroup>
        </div>
      </section>

      <!-- ── Notifications ─────────────────────────────────────────────── -->
      <section id="notifications" class="atrium-settings__section">
        <div class="atrium-settings__section-head">
          <UIcon name="i-lucide-bell" class="size-4 text-primary" />
          <h2>Notifications</h2>
        </div>
        <div class="atrium-settings__row">
          <label class="atrium-settings__label">
            Replies to my posts
            <span class="atrium-settings__hint">When someone replies in a thread you authored or replied to.</span>
          </label>
          <USwitch v-model="notifyPrefs.replies" />
        </div>
        <div class="atrium-settings__row">
          <label class="atrium-settings__label">
            @mentions
            <span class="atrium-settings__hint">When someone mentions your pubkey prefix in a post body.</span>
          </label>
          <USwitch v-model="notifyPrefs.mentions" />
        </div>
        <div class="atrium-settings__row">
          <label class="atrium-settings__label">
            Reactions on my posts
            <span class="atrium-settings__hint">Quieter than replies — toggle off if it's noisy.</span>
          </label>
          <USwitch v-model="notifyPrefs.reactions" />
        </div>
        <div class="atrium-settings__row">
          <label class="atrium-settings__label">
            Voice-room join pings
            <span class="atrium-settings__hint">Notify me when someone joins a room I follow.</span>
          </label>
          <USwitch v-model="notifyPrefs.voiceJoin" />
        </div>
        <div class="atrium-settings__row">
          <label class="atrium-settings__label">
            Play sound on new notification
            <span class="atrium-settings__hint">Plays a subtle chime when the bell ticks up.</span>
          </label>
          <USwitch v-model="notifyPrefs.sound" />
        </div>
        <UAlert
          icon="i-lucide-info"
          color="neutral"
          variant="subtle"
          title="Browser-local"
          description="Preferences here only affect this device. Server-side mute rules will follow in a later release."
        />
      </section>

      <!-- ── Following ─────────────────────────────────────────────────── -->
      <section id="following" class="atrium-settings__section">
        <div class="atrium-settings__section-head">
          <UIcon name="i-lucide-heart" class="size-4 text-primary" />
          <h2>Following</h2>
          <UBadge color="neutral" variant="subtle" size="sm" class="ml-auto">
            {{ follows.follows.value.length }} thread{{ follows.follows.value.length === 1 ? "" : "s" }}
          </UBadge>
        </div>
        <p v-if="!followedThreads.length && !orphanedFollows.length" class="text-sm text-dimmed">
          You're not following anything yet. Tap the heart on a thread to follow it — its activity will surface in your inbox.
        </p>
        <ul v-if="followedThreads.length" class="atrium-settings__list">
          <li v-for="t in followedThreads" :key="t.id">
            <NuxtLink :to="`/t/${t.id}`" class="atrium-settings__list-link">
              <UIcon name="i-lucide-message-square-text" class="size-4 text-dimmed shrink-0" />
              <span class="truncate flex-1">{{ t.label }}</span>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-heart-off"
                aria-label="Unfollow"
                @click.prevent="unfollow(t.id)"
              />
            </NuxtLink>
          </li>
        </ul>
        <div v-if="orphanedFollows.length" class="atrium-settings__row">
          <p class="text-sm text-dimmed">
            <UIcon name="i-lucide-circle-alert" class="size-3.5 inline-block text-warning" />
            {{ orphanedFollows.length }} followed thread{{ orphanedFollows.length === 1 ? "" : "s" }} no longer exist in this forum.
          </p>
          <UButton
            color="warning"
            variant="soft"
            size="sm"
            icon="i-lucide-broom"
            @click="pruneOrphaned"
          >
            Prune
          </UButton>
        </div>
      </section>

      <!-- ── Devices / identity ────────────────────────────────────────── -->
      <section id="devices" class="atrium-settings__section">
        <div class="atrium-settings__section-head">
          <UIcon name="i-lucide-laptop" class="size-4 text-primary" />
          <h2>Identity &amp; devices</h2>
        </div>
        <div class="atrium-settings__row">
          <p class="atrium-settings__label">
            Sign in or switch account
            <span class="atrium-settings__hint">
              Use the chip in the sidebar footer to authenticate or change identity.
            </span>
          </p>
        </div>
        <div class="atrium-settings__row">
          <UButton
            color="error"
            variant="soft"
            size="sm"
            icon="i-lucide-log-out"
            @click="abra.logout?.()"
          >
            Disconnect
          </UButton>
        </div>
      </section>

      <!-- ── Data ──────────────────────────────────────────────────────── -->
      <section id="data" class="atrium-settings__section">
        <div class="atrium-settings__section-head">
          <UIcon name="i-lucide-database" class="size-4 text-primary" />
          <h2>Local data</h2>
        </div>
        <div class="atrium-settings__row">
          <p class="atrium-settings__label">
            Clear cached follows
            <span class="atrium-settings__hint">Drops the local-storage follow list. Doesn't affect peers.</span>
          </p>
          <UButton color="neutral" variant="soft" icon="i-lucide-trash-2" @click="clearFollows">
            Clear
          </UButton>
        </div>
        <div class="atrium-settings__row">
          <p class="atrium-settings__label">
            Clear local drafts
            <span class="atrium-settings__hint">Discards in-progress drafts cached in this browser.</span>
          </p>
          <UButton color="neutral" variant="soft" icon="i-lucide-trash-2" @click="clearDrafts">
            Clear
          </UButton>
        </div>
        <div class="atrium-settings__row">
          <p class="atrium-settings__label">
            Reset scroll positions
            <span class="atrium-settings__hint">Clears restored scroll for every thread.</span>
          </p>
          <UButton color="neutral" variant="soft" icon="i-lucide-arrow-up" @click="clearScroll">
            Reset
          </UButton>
        </div>
      </section>

      <template #fallback>
        <div class="flex justify-center py-16">
          <UIcon name="i-lucide-loader-circle" class="size-6 text-dimmed animate-spin" />
        </div>
      </template>
    </ClientOnly>

    <UModal v-model:open="confirmOpen" :ui="{ content: 'max-w-md' }">
      <template #header>
        <p class="font-semibold">{{ confirmCopy.title }}</p>
      </template>
      <template #body>
        <p class="text-sm">{{ confirmCopy.body }}</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="confirmOpen = false">
            Cancel
          </UButton>
          <UButton color="error" @click="commitClear">
            {{ confirmCopy.cta }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.atrium-settings {
  max-width: 56rem;
  margin: 0 auto;
  width: 100%;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.atrium-settings__head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}
.atrium-settings__section {
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-lg, 1rem);
  background: var(--ui-bg);
  padding: 1.25rem 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.atrium-settings__section-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--ui-border);
  padding-bottom: 0.65rem;
  margin-bottom: 0.15rem;
}
.atrium-settings__section-head h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
.atrium-settings__row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.atrium-settings__label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.875rem;
  font-weight: 500;
  flex: 1;
  min-width: 12rem;
}
.atrium-settings__hint {
  font-size: 0.75rem;
  color: var(--ui-text-dimmed);
  font-weight: 400;
}
.atrium-settings__row-action {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}
.atrium-settings__pubkey {
  font-family: var(--font-mono, ui-monospace);
  font-size: 0.75rem;
  padding: 0.35rem 0.55rem;
  border-radius: var(--atrium-radius-sm, 0.4rem);
  background: color-mix(in srgb, var(--ui-text-dimmed) 10%, transparent);
  flex: 1;
  min-width: 0;
}
.atrium-settings__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  flex-basis: 100%;
}
.atrium-settings__swatch {
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid color-mix(in srgb, black 20%, transparent);
  border-radius: 9999px;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.atrium-settings__swatch:hover {
  transform: scale(1.08);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 30%, transparent);
}
.atrium-settings__swatch--active {
  transform: scale(1.05);
  box-shadow:
    0 0 0 2px var(--ui-bg),
    0 0 0 4px var(--ui-primary);
}
.atrium-settings__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-md, 0.65rem);
  overflow: hidden;
}
.atrium-settings__list li + li .atrium-settings__list-link {
  border-top: 1px solid var(--ui-border);
}
.atrium-settings__list-link {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.9rem;
  text-decoration: none;
  color: inherit;
  transition: background 0.15s ease;
}
.atrium-settings__list-link:hover {
  background: color-mix(in srgb, var(--ui-primary) 5%, transparent);
}
</style>
