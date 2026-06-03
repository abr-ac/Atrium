<script setup lang="ts">
// ForumSidebar — Discord-style channel list rendered as collapsible categories
// with board "channels" underneath. The active forum is taken from
// useAtriumNav(); when there's no forum yet (we're on /), a small intro card
// is shown instead of an empty pane.

const nav = useAtriumNav();
const route = useRoute();
const prefs = useAtriumShellPrefs();
const perms = useAtriumPermissions();

// Shared tree handle for board / category reorder. The whole atrium tree
// lives under SERVER_ROOT_ID, so a single useChildTree from there can
// moveEntry anything we care about.
const { doc } = useAbracadabra();
const tree = useChildTree(doc, nav.SERVER_ROOT_ID);

// Drag-and-drop reorder state. We track which board / category is being
// dragged and which row the cursor is over so a thin insertion line can
// render. v0 only supports within-parent reorder for categories (forum
// scoped) and across-category for boards.
type DragKind = "board" | "category";
const dragState = ref<{
  id: string;
  parentId: string;
  kind: DragKind;
} | null>(null);
const dragOver = ref<{
  id: string;
  position: "before" | "after";
  kind: DragKind;
} | null>(null);

function onDragStartItem(ev: DragEvent, id: string, parentId: string, kind: DragKind) {
  if (!ev.dataTransfer) return;
  dragState.value = { id, parentId, kind };
  ev.dataTransfer.effectAllowed = "move";
  ev.dataTransfer.setData("text/x-atrium-id", id);
  // Faded ghost — browsers handle this automatically once we put text on the
  // clipboard, but Firefox needs *something* to start the drag.
}

function onDragOverItem(ev: DragEvent, id: string, kind: DragKind) {
  if (!dragState.value || dragState.value.kind !== kind) return;
  ev.preventDefault();
  ev.dataTransfer!.dropEffect = "move";
  const target = ev.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const position = (ev.clientY - rect.top) < rect.height / 2 ? "before" : "after";
  dragOver.value = { id, position, kind };
}

function onDragLeaveItem(id: string) {
  if (dragOver.value?.id === id) dragOver.value = null;
}

function midpointOrder(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return Date.now();
  if (prev === null) return (next as number) - 1000;
  if (next === null) return prev + 1000;
  return (prev + next) / 2;
}

function onDropItem(ev: DragEvent, targetId: string, targetParentId: string, kind: DragKind) {
  if (!dragState.value || dragState.value.kind !== kind) {
    dragOver.value = null;
    return;
  }
  ev.preventDefault();
  const drag = dragState.value;
  const pos = dragOver.value?.position ?? "after";
  dragState.value = null;
  dragOver.value = null;

  if (drag.id === targetId) return;

  // Resolve siblings in the destination parent — categories use forumId,
  // boards use categoryId.
  const siblings = kind === "category"
    ? nav.categoriesForForum(targetParentId)
    : nav.boardsForCategory(targetParentId);

  const ordered = siblings.filter((s) => s.id !== drag.id);
  const targetIdx = ordered.findIndex((s) => s.id === targetId);
  if (targetIdx === -1 && drag.parentId === targetParentId) return;

  const insertIdx = targetIdx === -1
    ? ordered.length
    : pos === "before" ? targetIdx : targetIdx + 1;
  const prev = ordered[insertIdx - 1] ?? null;
  const next = ordered[insertIdx] ?? null;
  const newOrder = midpointOrder(
    prev ? prev.order ?? 0 : null,
    next ? next.order ?? 0 : null,
  );
  tree.moveEntry(drag.id, targetParentId, newOrder);
}

function onDropOnCategory(ev: DragEvent, categoryId: string) {
  // When boards are dropped on an empty category header (no rows in the
  // ul), append to the end of that category.
  if (!dragState.value || dragState.value.kind !== "board") return;
  ev.preventDefault();
  const drag = dragState.value;
  dragState.value = null;
  dragOver.value = null;
  const siblings = nav.boardsForCategory(categoryId).filter((s) => s.id !== drag.id);
  const last = siblings[siblings.length - 1] ?? null;
  tree.moveEntry(drag.id, categoryId, midpointOrder(last ? last.order ?? 0 : null, null));
}

function isDragOver(id: string, kind: DragKind): "before" | "after" | null {
  if (!dragOver.value || dragOver.value.kind !== kind) return null;
  return dragOver.value.id === id ? dragOver.value.position : null;
}

// DM unread count for the sidebar entry — only counts dm: channels involving
// the current user so generic channel unread doesn't bleed into this number.
const chat = useChat();
const { publicKeyB64 } = useAbracadabra();
const { count: bookmarkCount } = useAtriumBookmarks();
const dmUnread = computed(() => {
  const me = publicKeyB64.value;
  if (!me) return 0;
  let total = 0;
  for (const [key, ch] of Object.entries(chat.channels.value)) {
    if (!key.startsWith("dm:")) continue;
    if (!key.includes(me)) continue;
    total += ch.unreadCount ?? 0;
  }
  return total;
});

// Drag-to-resize on the right edge. Pointer events handle mouse + touch; we
// clamp to [MIN, MAX] and write through to localStorage immediately so a
// hard reload picks up the same width.
const dragging = ref(false);
let dragStartX = 0;
let dragStartWidth = 0;

function onDragStart(ev: PointerEvent) {
  dragging.value = true;
  dragStartX = ev.clientX;
  dragStartWidth = prefs.sidebarWidth.value;
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd, { once: true });
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}
function onDragMove(ev: PointerEvent) {
  if (!dragging.value) return;
  const delta = ev.clientX - dragStartX;
  const next = Math.max(prefs.SIDEBAR_MIN, Math.min(prefs.SIDEBAR_MAX, dragStartWidth + delta));
  prefs.sidebarWidth.value = next;
}
function onDragEnd() {
  dragging.value = false;
  window.removeEventListener("pointermove", onDragMove);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

function resetWidth() {
  prefs.sidebarWidth.value = prefs.SIDEBAR_DEFAULT;
}

const activeForum = computed(() => nav.trail.value.forum);
const activeBoardId = computed(() => nav.trail.value.board?.id ?? null);
const activeCategoryId = computed(() => nav.trail.value.category?.id ?? null);
const activeVoiceRoomId = computed(() => nav.trail.value.voiceRoom?.id ?? null);

const voiceRooms = computed(() => {
  if (!activeForum.value) return [];
  return nav.voiceRoomsForForum(activeForum.value.id);
});

const voiceCollapsed = ref(false);
function toggleVoice() {
  voiceCollapsed.value = !voiceCollapsed.value;
}

const collapsedCats = ref<Set<string>>(new Set());

function toggleCategory(id: string) {
  const set = new Set(collapsedCats.value);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  collapsedCats.value = set;
}

function isCatCollapsed(id: string): boolean {
  return collapsedCats.value.has(id);
}

const categories = computed(() => {
  if (!activeForum.value) return [];
  return nav.categoriesForForum(activeForum.value.id);
});

function boardsOf(catId: string) {
  return nav.boardsForCategory(catId);
}

function threadCountOf(boardId: string): number {
  return nav.threadsForBoard(boardId).length;
}

const forumLink = computed(() =>
  activeForum.value ? `/f/${activeForum.value.id}` : "/",
);
</script>

<template>
  <aside
    class="atrium-side"
    :aria-label="'Forum navigation'"
    :style="{ width: prefs.sidebarWidth.value + 'px' }"
  >
    <header class="atrium-side__head">
      <template v-if="activeForum">
        <div class="flex items-center gap-1 min-w-0">
          <NuxtLink :to="forumLink" class="atrium-side__title flex-1 min-w-0">
            <UIcon
              :name="`i-lucide-${(activeForum.meta as any)?.icon ?? 'message-square'}`"
              class="size-4 text-primary shrink-0"
            />
            <span class="truncate">{{ activeForum.label }}</span>
          </NuxtLink>
          <NuxtLink
            v-if="perms.canAdminForum(activeForum)"
            :to="`/f/${activeForum.id}/admin`"
            class="atrium-side__admin"
            :aria-label="`Manage ${activeForum.label}`"
            :title="`Manage ${activeForum.label}`"
          >
            <UIcon name="i-lucide-settings" class="size-3.5" />
          </NuxtLink>
        </div>
        <p
          v-if="(activeForum.meta as any)?.subtitle"
          class="atrium-side__subtitle truncate"
        >
          {{ (activeForum.meta as any).subtitle }}
        </p>
      </template>
      <template v-else>
        <p class="atrium-side__title atrium-side__title--idle">
          <UIcon name="i-lucide-house" class="size-4 text-dimmed shrink-0" />
          <span>All forums</span>
        </p>
        <p class="atrium-side__subtitle">
          Pick a forum from the rail.
        </p>
      </template>
    </header>

    <div class="atrium-side__scroll">
      <nav v-if="activeForum" class="atrium-side__nav">
        <section
          v-for="cat in categories"
          :key="cat.id"
          class="atrium-side__cat"
          :class="{
            'atrium-side__cat--active': activeCategoryId === cat.id,
            'atrium-side__cat--drop-before': isDragOver(cat.id, 'category') === 'before',
            'atrium-side__cat--drop-after': isDragOver(cat.id, 'category') === 'after',
          }"
        >
          <button
            type="button"
            class="atrium-side__catBtn"
            draggable="true"
            @click="toggleCategory(cat.id)"
            @dragstart="onDragStartItem($event, cat.id, activeForum!.id, 'category')"
            @dragover="onDragOverItem($event, cat.id, 'category')"
            @dragleave="onDragLeaveItem(cat.id)"
            @drop="onDropItem($event, cat.id, activeForum!.id, 'category')"
          >
            <UIcon
              name="i-lucide-chevron-down"
              class="size-3 atrium-side__chev"
              :class="{ 'atrium-side__chev--collapsed': isCatCollapsed(cat.id) }"
            />
            <span class="truncate">{{ cat.label }}</span>
            <UIcon
              v-if="(cat.meta as any)?.icon"
              :name="`i-lucide-${(cat.meta as any).icon}`"
              class="size-3 text-dimmed ml-auto shrink-0"
            />
          </button>
          <ul
            v-show="!isCatCollapsed(cat.id)"
            class="atrium-side__boards"
            @dragover.prevent
            @drop="onDropOnCategory($event, cat.id)"
          >
            <li
              v-for="board in boardsOf(cat.id)"
              :key="board.id"
              :class="{
                'atrium-side__li--drop-before': isDragOver(board.id, 'board') === 'before',
                'atrium-side__li--drop-after': isDragOver(board.id, 'board') === 'after',
              }"
            >
              <NuxtLink
                :to="`/b/${board.id}`"
                class="atrium-side__board"
                :class="{
                  'atrium-side__board--active': activeBoardId === board.id,
                  'atrium-side__board--dragging': dragState?.id === board.id,
                }"
                draggable="true"
                @dragstart="onDragStartItem($event, board.id, cat.id, 'board')"
                @dragover="onDragOverItem($event, board.id, 'board')"
                @dragleave="onDragLeaveItem(board.id)"
                @drop="onDropItem($event, board.id, cat.id, 'board')"
              >
                <span class="atrium-side__hash">#</span>
                <span class="truncate">{{ board.label }}</span>
                <UBadge
                  v-if="threadCountOf(board.id) > 0"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="ml-auto"
                >
                  {{ threadCountOf(board.id) }}
                </UBadge>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section v-if="voiceRooms.length" class="atrium-side__cat">
          <button
            type="button"
            class="atrium-side__catBtn"
            @click="toggleVoice"
          >
            <UIcon
              name="i-lucide-chevron-down"
              class="size-3 atrium-side__chev"
              :class="{ 'atrium-side__chev--collapsed': voiceCollapsed }"
            />
            <span class="truncate">Voice</span>
            <UIcon
              name="i-lucide-radio"
              class="size-3 text-primary ml-auto shrink-0"
            />
          </button>
          <ul v-show="!voiceCollapsed" class="atrium-side__boards">
            <li v-for="room in voiceRooms" :key="room.id">
              <NuxtLink
                :to="`/v/${room.id}`"
                class="atrium-side__board atrium-side__board--voice"
                :class="{
                  'atrium-side__board--active': activeVoiceRoomId === room.id,
                }"
              >
                <UIcon
                  :name="`i-lucide-${(room.meta as any)?.icon ?? 'headphones'}`"
                  class="size-3.5 shrink-0"
                />
                <span class="truncate">{{ room.label }}</span>
                <AtriumVoiceRoomBadge :room-id="room.id" class="ml-auto" />
              </NuxtLink>
            </li>
          </ul>
        </section>
      </nav>

      <nav v-else class="atrium-side__nav">
        <NuxtLink
          to="/"
          class="atrium-side__board atrium-side__board--top"
          :class="{ 'atrium-side__board--active': route.path === '/' }"
        >
          <UIcon name="i-lucide-house" class="size-3.5 text-dimmed" />
          <span>Browse all forums</span>
        </NuxtLink>
        <NuxtLink
          to="/inbox"
          class="atrium-side__board atrium-side__board--top"
          :class="{ 'atrium-side__board--active': route.path === '/inbox' }"
        >
          <UIcon name="i-lucide-inbox" class="size-3.5 text-dimmed" />
          <span>Inbox</span>
        </NuxtLink>
        <NuxtLink
          to="/dm"
          class="atrium-side__board atrium-side__board--top"
          :class="{ 'atrium-side__board--active': route.path.startsWith('/dm') }"
        >
          <UIcon name="i-lucide-mail" class="size-3.5 text-dimmed" />
          <span>Direct messages</span>
          <UBadge
            v-if="dmUnread > 0"
            color="primary"
            variant="solid"
            size="sm"
            class="ml-auto"
          >
            {{ dmUnread }}
          </UBadge>
        </NuxtLink>
        <NuxtLink
          to="/drafts"
          class="atrium-side__board atrium-side__board--top"
          :class="{ 'atrium-side__board--active': route.path === '/drafts' }"
        >
          <UIcon name="i-lucide-file-pen" class="size-3.5 text-dimmed" />
          <span>Drafts</span>
        </NuxtLink>
        <NuxtLink
          to="/bookmarks"
          class="atrium-side__board atrium-side__board--top"
          :class="{ 'atrium-side__board--active': route.path === '/bookmarks' }"
        >
          <UIcon name="i-lucide-bookmark" class="size-3.5 text-dimmed" />
          <span>Bookmarks</span>
          <UBadge
            v-if="bookmarkCount > 0"
            color="neutral"
            variant="subtle"
            size="sm"
            class="ml-auto"
          >
            {{ bookmarkCount }}
          </UBadge>
        </NuxtLink>
      </nav>
    </div>

    <footer class="atrium-side__foot">
      <ClientOnly>
        <AtriumUserChip />
        <template #fallback>
          <div class="atrium-side__foot-placeholder" />
        </template>
      </ClientOnly>
    </footer>

    <div
      class="atrium-side__resizer"
      :class="{ 'atrium-side__resizer--dragging': dragging }"
      :aria-label="'Resize sidebar'"
      role="separator"
      :aria-valuenow="prefs.sidebarWidth.value"
      :aria-valuemin="prefs.SIDEBAR_MIN"
      :aria-valuemax="prefs.SIDEBAR_MAX"
      @pointerdown="onDragStart"
      @dblclick="resetWidth"
    >
      <span class="atrium-side__resizer-grip" aria-hidden="true" />
    </div>
  </aside>
</template>

<style scoped>
.atrium-side {
  position: relative;
  flex-shrink: 0;
  background: var(--ui-bg);
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}
.atrium-side__resizer {
  position: absolute;
  top: 0;
  right: -4px;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.atrium-side__resizer-grip {
  width: 2px;
  height: 32px;
  border-radius: 2px;
  background: transparent;
  transition: background 0.15s ease;
}
.atrium-side__resizer:hover .atrium-side__resizer-grip,
.atrium-side__resizer--dragging .atrium-side__resizer-grip {
  background: color-mix(in srgb, var(--ui-primary) 70%, transparent);
}
.atrium-side__resizer--dragging {
  background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
}
.atrium-side__head {
  padding: 0.85rem 0.9rem 0.7rem;
  border-bottom: 1px solid var(--ui-border);
}
.atrium-side__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.95rem;
  color: inherit;
  text-decoration: none;
}
.atrium-side__title--idle {
  color: var(--ui-text-dimmed);
}
.atrium-side__admin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--atrium-radius-sm, 0.4rem);
  color: var(--ui-text-dimmed);
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}
.atrium-side__admin:hover {
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
  color: var(--ui-primary);
}
.atrium-side__subtitle {
  font-size: 0.75rem;
  color: var(--ui-text-dimmed);
  margin-top: 0.2rem;
}
.atrium-side__scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0.4rem;
}
.atrium-side__nav {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.atrium-side__cat {
  display: flex;
  flex-direction: column;
}
.atrium-side__catBtn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--ui-text-dimmed);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 0.4rem;
}
.atrium-side__catBtn:hover {
  background: color-mix(in srgb, var(--ui-primary) 6%, transparent);
  color: var(--ui-text);
}
.atrium-side__chev {
  transition: transform 0.18s ease;
}
.atrium-side__chev--collapsed {
  transform: rotate(-90deg);
}
.atrium-side__boards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.atrium-side__board {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem 0.35rem 1.05rem;
  border-radius: 0.4rem;
  color: var(--ui-text-dimmed);
  font-size: 0.85rem;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  min-width: 0;
}
.atrium-side__board:hover {
  background: color-mix(in srgb, var(--ui-primary) 6%, transparent);
  color: var(--ui-text);
}
.atrium-side__board--active {
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
  color: var(--ui-primary);
  font-weight: 500;
}
.atrium-side__board--top {
  padding-left: 0.6rem;
}
.atrium-side__hash {
  color: var(--ui-text-dimmed);
  width: 0.75rem;
  text-align: center;
}
.atrium-side__board--active .atrium-side__hash {
  color: var(--ui-primary);
}
.atrium-side__board--dragging {
  opacity: 0.4;
}
.atrium-side__li--drop-before,
.atrium-side__li--drop-after {
  position: relative;
}
.atrium-side__li--drop-before::before,
.atrium-side__li--drop-after::after {
  content: "";
  position: absolute;
  left: 1.05rem;
  right: 0.4rem;
  height: 2px;
  border-radius: 1px;
  background: var(--ui-primary);
  pointer-events: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 25%, transparent);
}
.atrium-side__li--drop-before::before { top: -1px; }
.atrium-side__li--drop-after::after { bottom: -1px; }
.atrium-side__cat--drop-before > .atrium-side__catBtn::before,
.atrium-side__cat--drop-after > .atrium-side__catBtn::after {
  content: "";
  position: absolute;
  left: 0.5rem;
  right: 0.5rem;
  height: 2px;
  border-radius: 1px;
  background: var(--ui-primary);
  pointer-events: none;
}
.atrium-side__cat--drop-before > .atrium-side__catBtn { position: relative; }
.atrium-side__cat--drop-after > .atrium-side__catBtn { position: relative; }
.atrium-side__cat--drop-before > .atrium-side__catBtn::before { top: -1px; }
.atrium-side__cat--drop-after > .atrium-side__catBtn::after { bottom: -1px; }
.atrium-side__foot {
  border-top: 1px solid var(--ui-border);
  padding: 0.5rem;
}
.atrium-side__foot-placeholder {
  height: 2.75rem;
}
</style>
