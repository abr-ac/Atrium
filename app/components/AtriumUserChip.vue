<script setup lang="ts">
// Sidebar-footer user chip. Replaces the lonely "All saved" pill. Shows the
// user's avatar with a connection dot + their display name + a chevron. The
// dropdown surfaces inline name edit, color picker (primary + neutral), copy
// public key, theme toggle, and disconnect.

import type { DropdownMenuItem } from "@nuxt/ui";

const abra = useAbracadabra();
const colorMode = useColorMode();
const router = useRouter();

const nameEditOpen = ref(false);
const colorPaletteOpen = ref(false);
const draftName = ref("");

function openNameEditor() {
  draftName.value = abra.userName.value;
  nameEditOpen.value = true;
}

function commitName() {
  const next = draftName.value.trim();
  if (next.length && next !== abra.userName.value) {
    abra.setUserName(next);
  }
  nameEditOpen.value = false;
}

async function copyPublicKey() {
  try {
    await navigator.clipboard.writeText(abra.publicKeyB64.value);
  }
  catch (e) {
    if (import.meta.dev) console.warn("[atrium] failed to copy public key:", e);
  }
}

const SWATCHES = [
  "orange",
  "amber",
  "yellow",
  "lime",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "red",
] as const;

function pickColor(name: string) {
  abra.setUserColor(name);
  colorPaletteOpen.value = false;
}

const connectionLabel = computed(() => {
  const s = abra.status.value;
  if (s === "connected") return `Connected · ${abra.userCount.value} peer${abra.userCount.value === 1 ? "" : "s"}`;
  if (s === "connecting") return "Connecting…";
  return "Offline";
});

const connectionTone = computed<"primary" | "warning" | "neutral">(() => {
  const s = abra.status.value;
  if (s === "connected") return "primary";
  if (s === "connecting") return "warning";
  return "neutral";
});

// Auth state — anon users get sign-in / create-account CTAs; signed-in users
// get account-switcher access.
const isAnonymous = computed(() => {
  // The SDK considers a user "claimed" once they have a username + password
  // attached. Lacking that, surface the claim path.
  return !abra.username?.value;
});
const accountSwitcherOpen = ref(false);
const loginOpen = ref(false);
const registerOpen = ref(false);
const claimOpen = ref(false);

const items = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: abra.userName.value,
      icon: "i-lucide-user",
      type: "label" as const,
    },
    {
      label: connectionLabel.value,
      icon:
        abra.status.value === "connected"
          ? "i-lucide-circle-check"
          : abra.status.value === "connecting"
            ? "i-lucide-loader"
            : "i-lucide-circle-off",
      type: "label" as const,
    },
  ],
  [
    ...(isAnonymous.value
      ? [
          {
            label: "Sign in",
            icon: "i-lucide-log-in",
            onSelect: () => { loginOpen.value = true; },
          },
          {
            label: "Create an account",
            icon: "i-lucide-user-plus",
            onSelect: () => { registerOpen.value = true; },
          },
          {
            label: "Claim this identity",
            icon: "i-lucide-shield-check",
            onSelect: () => { claimOpen.value = true; },
          },
        ]
      : [
          {
            label: "Switch account",
            icon: "i-lucide-users",
            onSelect: () => { accountSwitcherOpen.value = true; },
          },
        ]),
  ],
  [
    {
      label: "Edit name",
      icon: "i-lucide-pencil",
      onSelect: openNameEditor,
    },
    {
      label: "Change accent color",
      icon: "i-lucide-palette",
      onSelect: () => { colorPaletteOpen.value = true; },
    },
    {
      label: "Copy public key",
      icon: "i-lucide-key",
      onSelect: copyPublicKey,
    },
  ],
  [
    {
      label: colorMode.value === "dark" ? "Light mode" : "Dark mode",
      icon: colorMode.value === "dark" ? "i-lucide-sun" : "i-lucide-moon",
      onSelect: () => {
        colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
      },
    },
    {
      label: "Settings",
      icon: "i-lucide-settings",
      onSelect: () => router.push("/settings"),
    },
  ],
  [
    {
      label: "Disconnect",
      icon: "i-lucide-log-out",
      color: "error" as const,
      onSelect: () => abra.logout?.(),
    },
  ],
]);
</script>

<template>
  <div class="atrium-userchip">
    <UDropdownMenu
      :items="items"
      :content="{ align: 'start', side: 'top', sideOffset: 6 }"
      :ui="{ content: 'min-w-56' }"
    >
      <button type="button" class="atrium-userchip__btn">
        <AtriumAvatar
          :name="abra.userName.value"
          :color="abra.userColor.value"
          :size="32"
          :status="abra.status.value"
          mine
        />
        <span class="atrium-userchip__col">
          <span class="atrium-userchip__name truncate">
            {{ abra.userName.value || 'Anonymous' }}
          </span>
          <UBadge
            :color="connectionTone"
            variant="subtle"
            size="sm"
            class="atrium-userchip__status"
          >
            {{ connectionLabel }}
          </UBadge>
        </span>
        <UIcon name="i-lucide-chevron-up" class="size-3.5 text-dimmed shrink-0" />
      </button>
    </UDropdownMenu>

    <ClientOnly>
      <APasswordLoginModal v-model:open="loginOpen" />
      <APasswordRegisterModal v-model:open="registerOpen" />
      <AClaimAccountModal v-model:open="claimOpen" />
      <AAccountSwitcherModal v-model:open="accountSwitcherOpen" />
    </ClientOnly>

    <UModal v-model:open="nameEditOpen" :ui="{ content: 'max-w-md' }">
      <template #header>
        <p class="font-semibold">Edit display name</p>
      </template>
      <template #body>
        <div class="flex flex-col gap-2">
          <p class="text-sm text-dimmed">
            Visible to other peers in posts, presence, and reactions.
          </p>
          <UInput
            v-model="draftName"
            autofocus
            size="lg"
            placeholder="Display name"
            @keydown.enter="commitName"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="nameEditOpen = false">
            Cancel
          </UButton>
          <UButton color="primary" :disabled="!draftName.trim()" @click="commitName">
            Save
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="colorPaletteOpen" :ui="{ content: 'max-w-md' }">
      <template #header>
        <p class="font-semibold">Pick your accent color</p>
      </template>
      <template #body>
        <div class="flex flex-col gap-2">
          <p class="text-sm text-dimmed">
            Used as your avatar tint and the brand color while you're signed in.
          </p>
          <div class="atrium-userchip__swatches">
            <button
              v-for="c in SWATCHES"
              :key="c"
              type="button"
              class="atrium-userchip__swatch"
              :class="{
                'atrium-userchip__swatch--active': abra.userColorName.value === c,
              }"
              :style="{
                background: `var(--ui-color-${c}-500, var(--color-${c}-500))`,
              }"
              :aria-label="c"
              :title="c"
              @click="pickColor(c)"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.atrium-userchip {
  width: 100%;
}
.atrium-userchip__btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.55rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.6rem;
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}
.atrium-userchip__btn:hover {
  background: color-mix(in srgb, var(--ui-primary) 6%, transparent);
  border-color: color-mix(in srgb, var(--ui-primary) 24%, var(--ui-border));
}
.atrium-userchip__col {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  flex: 1;
}
.atrium-userchip__name {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1;
}
.atrium-userchip__status {
  align-self: flex-start;
  font-size: 0.65rem !important;
}
.atrium-userchip__swatches {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.45rem;
  padding: 0.25rem 0;
}
.atrium-userchip__swatch {
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, black 20%, transparent);
  border-radius: 0.4rem;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.atrium-userchip__swatch:hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 30%, transparent);
}
.atrium-userchip__swatch--active {
  box-shadow:
    0 0 0 2px var(--ui-bg),
    0 0 0 4px var(--ui-primary);
}
</style>
