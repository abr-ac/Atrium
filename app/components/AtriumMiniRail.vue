<script setup lang="ts">
// MiniRail — Discord-style forum switcher. 60px wide column showing one
// rounded-square avatar per forum. Active forum gets a primary indicator
// stripe on the left edge. Hovering reveals the forum label as a tooltip
// flag to the right.

import type { DropdownMenuItem } from "@nuxt/ui";

const nav = useAtriumNav();
const route = useRoute();
const router = useRouter();

const activeForumId = computed(() => nav.trail.value.forum?.id ?? null);

// Mirror the topbar "Create" menu so the rail "+" isn't a dead-end. The
// rail surface keeps a "New forum" entry visible-but-disabled so the user
// sees the intent even though the create-forum flow isn't shipped yet.
const activeForum = computed(() => nav.trail.value.forum);
const activeBoard = computed(() => nav.trail.value.board);

const newThreadTarget = computed<string | null>(() => {
  if (activeBoard.value) return `/b/${activeBoard.value.id}?compose=1`;
  const forum = activeForum.value;
  if (!forum) return null;
  for (const c of nav.categoriesForForum(forum.id)) {
    const boards = nav.boardsForCategory(c.id);
    if (boards.length) return `/b/${boards[0]!.id}?compose=1`;
  }
  return null;
});

const voiceRoomsForActive = computed(() => {
  const forum = activeForum.value;
  if (!forum) return [];
  return nav.voiceRoomsForForum(forum.id);
});

const createItems = computed<DropdownMenuItem[][]>(() => {
  const group: DropdownMenuItem[] = [
    newThreadTarget.value
      ? {
          label: "New thread",
          icon: "i-lucide-square-pen",
          onSelect() { router.push(newThreadTarget.value!); },
        }
      : { label: "New thread", icon: "i-lucide-square-pen", disabled: true },
  ];
  if (voiceRoomsForActive.value.length) {
    group.push({
      label: "Join voice room",
      icon: "i-lucide-radio",
      children: voiceRoomsForActive.value.map((r) => ({
        label: r.label,
        icon: `i-lucide-${(r.meta as any)?.icon ?? "headphones"}`,
        onSelect() { router.push(`/v/${r.id}`); },
      })),
    });
  }
  group.push({
    label: "New forum",
    icon: "i-lucide-message-square-plus",
    disabled: true,
  });
  return [group];
});

function forumInitials(label: string): string {
  return label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2)
    || "•";
}

// Hash forum id into a deterministic hue so each forum reads visually distinct
// at a glance.
function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}
</script>

<template>
  <aside class="atrium-rail" :aria-label="'Forum switcher'">
    <NuxtLink
      to="/"
      class="atrium-rail__brand"
      :class="{ 'atrium-rail__brand--home': route.path === '/' }"
    >
      <AbracadabraHexLogo static class="!size-10 text-primary" />
    </NuxtLink>

    <div class="atrium-rail__sep" />

    <div class="atrium-rail__list">
      <UTooltip
        v-for="f in nav.forums.value"
        :key="f.id"
        :text="f.label"
        :delay-duration="200"
        :content="{ side: 'right' }"
      >
        <NuxtLink
          :to="`/f/${f.id}`"
          class="atrium-rail__chip"
          :class="{ 'atrium-rail__chip--active': activeForumId === f.id }"
          :style="`--rail-hue:${hueFor(f.id)}`"
        >
          <span class="atrium-rail__indicator" aria-hidden="true" />
          <UIcon
            v-if="(f.meta as any)?.icon"
            :name="`i-lucide-${(f.meta as any).icon}`"
            class="atrium-rail__icon"
          />
          <span v-else class="atrium-rail__initials">{{ forumInitials(f.label) }}</span>
        </NuxtLink>
      </UTooltip>
    </div>

    <div class="atrium-rail__spacer" />

    <UDropdownMenu :items="createItems" :content="{ side: 'right', align: 'end' }">
      <button
        type="button"
        class="atrium-rail__chip atrium-rail__chip--add"
        aria-label="Create"
      >
        <UIcon name="i-lucide-plus" class="atrium-rail__icon" />
      </button>
    </UDropdownMenu>
  </aside>
</template>

<style scoped>
.atrium-rail {
  width: 64px;
  flex-shrink: 0;
  background: var(--ui-bg-elevated);
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.65rem 0;
  gap: 0.35rem;
  height: 100%;
}
.atrium-rail__brand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 0.8rem;
  text-decoration: none;
  transition: background 0.15s ease;
}
.atrium-rail__brand:hover,
.atrium-rail__brand--home {
  background: color-mix(in srgb, var(--ui-primary) 12%, transparent);
}
.atrium-rail__sep {
  width: 28px;
  height: 1px;
  background: var(--ui-border);
  margin: 0.25rem 0;
}
.atrium-rail__list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: center;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  padding: 0 0 0.5rem;
  scrollbar-width: none;
}
.atrium-rail__list::-webkit-scrollbar { display: none; }
.atrium-rail__spacer { flex: 1; }
.atrium-rail__chip {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  cursor: pointer;
  border-radius: 9999px;
  background: hsl(var(--rail-hue, 30) 60% 88% / 0.18);
  color: hsl(var(--rail-hue, 30) 70% 65%);
  transition:
    border-radius 0.15s ease,
    background 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
  text-decoration: none;
}
.atrium-rail__chip:hover {
  border-radius: 0.7rem;
  background: hsl(var(--rail-hue, 30) 60% 60% / 0.25);
  color: hsl(var(--rail-hue, 30) 75% 70%);
}
.atrium-rail__chip--active {
  border-radius: 0.7rem;
  background: color-mix(in srgb, var(--ui-primary) 20%, transparent);
  color: var(--ui-primary);
}
.atrium-rail__chip--add {
  background: transparent;
  color: var(--ui-text-dimmed);
  border: 1px dashed var(--ui-border);
}
.atrium-rail__chip--add:hover {
  color: var(--ui-primary);
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
}
.atrium-rail__indicator {
  position: absolute;
  left: -10px;
  top: 50%;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: var(--ui-primary);
  height: 0;
  opacity: 0;
  transform: translateY(-50%);
  transition:
    height 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.15s ease;
}
.atrium-rail__chip--active .atrium-rail__indicator {
  height: 28px;
  opacity: 1;
}
.atrium-rail__chip:hover .atrium-rail__indicator {
  height: 14px;
  opacity: 0.7;
}
.atrium-rail__chip--active:hover .atrium-rail__indicator {
  height: 28px;
  opacity: 1;
}
.atrium-rail__icon {
  width: 1.1rem;
  height: 1.1rem;
}
.atrium-rail__initials {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}
</style>
