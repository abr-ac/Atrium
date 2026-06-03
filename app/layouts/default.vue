<script setup lang="ts">
// Atrium triple-pane shell:
//   [mini rail · 60] [forum sidebar · 260] [main · flex] [right strip · 44]
// 44px top app bar carries breadcrumb, search trigger, create menu,
// color-mode toggle, and notifications. Aware presence overlays are
// teleported to <body> so they don't reserve grid space.

import AtriumMiniRail from "~/components/AtriumMiniRail.vue";
import AtriumForumSidebar from "~/components/AtriumForumSidebar.vue";
import AtriumRightRail from "~/components/AtriumRightRail.vue";
import AtriumCommandPalette from "~/components/AtriumCommandPalette.vue";
import type { DropdownMenuItem } from "@nuxt/ui";

const nav = useAtriumNav();
const route = useRoute();
const router = useRouter();
const colorMode = useColorMode();

// Breadcrumb is collapsed mid-trail when the chain exceeds 4 segments so the
// topbar doesn't push the search/utility cluster off-screen.
const breadcrumb = computed(() => {
  const items: { label: string; to?: string; icon?: string }[] = [];
  const t = nav.trail.value;
  // The brand mark to the left of the breadcrumb is the home link, so we
  // skip the redundant "Atrium" root item.
  if (t.forum) items.push({ label: t.forum.label, to: `/f/${t.forum.id}` });
  if (t.category) items.push({ label: t.category.label, to: `/c/${t.category.id}` });
  if (t.board) items.push({ label: t.board.label, to: `/b/${t.board.id}` });
  if (t.thread) items.push({ label: t.thread.label, to: `/t/${t.thread.id}` });
  if (t.voiceRoom) items.push({ label: t.voiceRoom.label, to: `/v/${t.voiceRoom.id}`, icon: "i-lucide-radio" });
  if (route.path === "/inbox") items.push({ label: "Inbox", to: "/inbox", icon: "i-lucide-inbox" });
  if (items.length <= 4) return items;
  // Keep first, last two; collapse the middle into one ellipsis.
  return [items[0]!, { label: "…", to: undefined }, ...items.slice(-2)];
});

const searchOpen = ref(false);

const activeForum = computed(() => nav.trail.value.forum);
const activeBoard = computed(() => nav.trail.value.board);

// Pick the closest sensible "open thread composer" target. If we're already
// in a board, use that. Else pick the first board of the active forum, else
// punt to the global landing.
const newThreadTarget = computed<string | null>(() => {
  if (activeBoard.value) return `/b/${activeBoard.value.id}?compose=1`;
  const forum = activeForum.value;
  if (!forum) return null;
  const cats = nav.categoriesForForum(forum.id);
  for (const c of cats) {
    const boards = nav.boardsForCategory(c.id);
    if (boards.length) return `/b/${boards[0]!.id}?compose=1`;
  }
  return null;
});

const voiceRooms = computed(() => {
  const forum = activeForum.value;
  if (!forum) return [];
  return nav.voiceRoomsForForum(forum.id);
});

const createItems = computed<DropdownMenuItem[][]>(() => {
  const items: DropdownMenuItem[] = [];
  if (newThreadTarget.value) {
    items.push({
      label: "New thread",
      icon: "i-lucide-square-pen",
      kbds: ["c"],
      onSelect() { router.push(newThreadTarget.value!); },
    });
  }
  else {
    items.push({
      label: "New thread",
      icon: "i-lucide-square-pen",
      disabled: true,
    });
  }
  if (voiceRooms.value.length) {
    items.push({
      label: "Join voice room",
      icon: "i-lucide-radio",
      children: voiceRooms.value.map((r) => ({
        label: r.label,
        icon: `i-lucide-${(r.meta as any)?.icon ?? "headphones"}`,
        onSelect() { router.push(`/v/${r.id}`); },
      })),
    });
  }
  return [items];
});

const colorModeIcon = computed(() =>
  colorMode.value === "dark" ? "i-lucide-sun" : "i-lucide-moon",
);

function toggleColorMode() {
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
}

const density = useAtriumDensity();
const dm = useAtriumDM();
const viewport = useAtriumViewport();
// Reactive forum theme — reads forum.meta.color and writes CSS vars at
// the document root so the rest of Atrium picks up the accent.
useAtriumForumTheme();

// Mobile drawers: forum sidebar (left) + member panel (right). Both open
// via header buttons on narrow viewports and overlay the main column.
const leftDrawerOpen = ref(false);
const rightDrawerOpen = ref(false);

// Close drawers automatically when navigating between routes.
watch(() => route.fullPath, () => {
  leftDrawerOpen.value = false;
  rightDrawerOpen.value = false;
});
const densityIcon = computed(() =>
  density.isCompact.value ? "i-lucide-rows-3" : "i-lucide-rows-2",
);
const densityLabel = computed(() =>
  density.isCompact.value ? "Switch to comfortable layout" : "Switch to compact layout",
);

defineShortcuts({
  meta_k: { handler: () => { searchOpen.value = true; }, usingInput: true },
  c: { handler: () => { if (newThreadTarget.value) router.push(newThreadTarget.value); } },
  "/": { handler: () => { router.push("/search"); } },
});
</script>

<template>
  <div class="atrium-shell">
    <header class="atrium-topbar">
      <div class="atrium-topbar__left">
        <ClientOnly>
          <UButton
            v-if="viewport.isMobile.value"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            icon="i-lucide-menu"
            aria-label="Open navigation"
            class="atrium-topbar__hamburger"
            @click="leftDrawerOpen = true"
          />
        </ClientOnly>
        <AbracadabraBrand class="atrium-topbar__brand" />
        <UBreadcrumb
          v-if="breadcrumb.length"
          :items="breadcrumb"
          class="min-w-0 atrium-topbar__crumbs"
        />
      </div>
      <div class="atrium-topbar__right">
        <UButton
          color="neutral"
          variant="subtle"
          size="sm"
          icon="i-lucide-search"
          class="atrium-topbar__search"
          :ui="{ base: 'w-60 justify-start text-dimmed font-normal' }"
          @click="searchOpen = true"
        >
          <span class="hidden sm:inline">Search</span>
          <span class="ms-auto hidden sm:inline-flex items-center gap-1">
            <UKbd>⌘</UKbd>
            <UKbd>K</UKbd>
          </span>
        </UButton>
        <UDropdownMenu
          :items="createItems"
          :ui="{ content: 'min-w-52' }"
        >
          <UButton
            color="primary"
            variant="soft"
            size="sm"
            icon="i-lucide-plus"
            square
            aria-label="Create"
          />
        </UDropdownMenu>
        <ClientOnly>
          <UButton
            :icon="densityIcon"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            :aria-label="densityLabel"
            :title="densityLabel"
            @click="density.toggle"
          />
          <UButton
            :icon="colorModeIcon"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            aria-label="Toggle color mode"
            @click="toggleColorMode"
          />
          <template #fallback>
            <UButton
              icon="i-lucide-moon"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              disabled
            />
          </template>
        </ClientOnly>
        <ClientOnly>
          <ANotifications />
        </ClientOnly>
        <ClientOnly>
          <UButton
            v-if="viewport.isNarrow.value"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            icon="i-lucide-users"
            aria-label="Open member panel"
            class="atrium-topbar__hamburger"
            @click="rightDrawerOpen = true"
          />
        </ClientOnly>
      </div>
    </header>

    <div class="atrium-body">
      <ClientOnly>
        <AtriumMiniRail />
        <AtriumForumSidebar
          v-if="!viewport.isMobile.value"
        />
        <USlideover
          v-else
          v-model:open="leftDrawerOpen"
          side="left"
          :ui="{ content: 'atrium-drawer atrium-drawer--left' }"
        >
          <template #content>
            <div class="atrium-drawer__inner">
              <div class="atrium-drawer__rails">
                <AtriumMiniRail />
                <AtriumForumSidebar />
              </div>
            </div>
          </template>
        </USlideover>
      </ClientOnly>

      <main class="atrium-main">
        <slot />
      </main>

      <ClientOnly>
        <AtriumRightRail
          v-if="!viewport.isNarrow.value"
        />
        <USlideover
          v-else
          v-model:open="rightDrawerOpen"
          side="right"
          :ui="{ content: 'atrium-drawer atrium-drawer--right' }"
        >
          <template #content>
            <AtriumRightRail />
          </template>
        </USlideover>
      </ClientOnly>
    </div>

    <ClientOnly>
      <AtriumCommandPalette v-model:open="searchOpen" />
    </ClientOnly>

    <ClientOnly>
      <AtriumVoiceMiniWidget />
    </ClientOnly>

    <ClientOnly>
      <AtriumDMModal
        v-if="dm.target.value"
        v-model:open="dm.open.value"
        :recipient-pubkey="dm.target.value.pubkey"
        :recipient-name="dm.target.value.name"
        :recipient-color="dm.target.value.color"
      />
    </ClientOnly>

    <ClientOnly>
      <Teleport to="body">
        <APresenceBlobs />
        <AFollowBar />
        <AKeyHint />
        <AGlobalFocusLayer />
        <AFollowScroll />
        <AAuthLinkLanding />
      </Teleport>
    </ClientOnly>
  </div>
</template>

<style>
.atrium-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg);
  color: var(--ui-text);
}
.atrium-topbar {
  height: 44px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  gap: 1rem;
  z-index: 5;
}
.atrium-topbar__left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex: 1;
}
.atrium-topbar__brand {
  margin-right: 0.5rem;
}
.atrium-topbar__crumbs {
  font-size: 0.875rem;
  position: relative;
  padding-left: 0.85rem;
}
.atrium-topbar__crumbs::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 1.1rem;
  background: var(--ui-border);
}
.atrium-topbar__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.atrium-topbar__search {
  flex-shrink: 0;
}
.atrium-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.atrium-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--ui-bg);
}
.atrium-topbar__hamburger {
  flex-shrink: 0;
}
@media (max-width: 767px) {
  .atrium-topbar {
    padding: 0 0.6rem;
    gap: 0.35rem;
  }
  .atrium-topbar__search :deep([class*="w-60"]) {
    width: 2.25rem !important;
    min-width: 2.25rem !important;
  }
}
:global(.atrium-drawer.atrium-drawer--left) {
  width: min(90vw, 320px) !important;
  padding: 0 !important;
}
:global(.atrium-drawer.atrium-drawer--right) {
  width: min(90vw, 280px) !important;
  padding: 0 !important;
}
:global(.atrium-drawer__inner) {
  display: flex;
  height: 100%;
}
:global(.atrium-drawer__rails) {
  display: flex;
  height: 100%;
  flex: 1;
  min-width: 0;
}
</style>
