<script setup lang="ts">
// Forum admin page — visible to anyone who can access the forum, but
// authoring power scales with the user's role. v0 is permissive: any
// signed-in peer can edit forum metadata, add/remove categories &
// boards. Server-side enforcement is a later round (atrium isn't gating
// writes yet).

const route = useRoute();
const router = useRouter();
const toast = useToast();
const nav = useAtriumNav();
const perms = useAtriumPermissions();
const { doc } = useAbracadabra();
const tree = useChildTree(doc, nav.SERVER_ROOT_ID);

const forumId = computed(() => route.params.id as string);

const forum = computed(() =>
  nav.allEntries.value.find((e) => e.id === forumId.value && e.type === "forum") ?? null,
);

// Permission check — must be either server-side admin or the forum's
// recorded owner pubkey. Non-owners see a friendly deny notice.
const canAdmin = computed(() => perms.canAdminForum(forum.value));
const treeLoaded = computed(() => nav.allEntries.value.length > 0);

const categories = computed(() =>
  forum.value ? nav.categoriesForForum(forum.value.id) : [],
);

function boardsOf(catId: string) {
  return nav.boardsForCategory(catId);
}

// ── Forum metadata edits ───────────────────────────────────────────────────
const labelDraft = ref("");
const subtitleDraft = ref("");
const iconDraft = ref("");
const colorDraft = ref<string>("");
const bannerDraft = ref<string>("");
watchEffect(() => {
  if (!forum.value) return;
  labelDraft.value = forum.value.label;
  const meta = (forum.value.meta ?? {}) as Record<string, unknown>;
  subtitleDraft.value = (meta.subtitle as string) ?? "";
  iconDraft.value = (meta.icon as string) ?? "message-square";
  colorDraft.value = (meta.color as string) ?? "";
  bannerDraft.value = (meta.banner as string) ?? "";
});

const COLOR_SWATCHES = [
  "orange", "amber", "yellow", "lime", "emerald", "teal", "cyan", "sky",
  "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "red",
] as const;

function saveForumMeta() {
  if (!forum.value) return;
  const next = labelDraft.value.trim();
  if (next && next !== forum.value.label) tree.renameEntry(forum.value.id, next);
  tree.updateMeta(forum.value.id, {
    subtitle: subtitleDraft.value.trim() || undefined,
    icon: iconDraft.value.trim() || "message-square",
    color: colorDraft.value || undefined,
    banner: bannerDraft.value.trim() || undefined,
  } as Record<string, unknown>);
  toast.add({ title: "Forum saved", icon: "i-lucide-check-circle-2" });
}

function pickAccent(name: string) {
  colorDraft.value = colorDraft.value === name ? "" : name;
}

const currentOwner = computed(() => (forum.value?.meta as any)?.owner as string | undefined);
const abra = useAbracadabra();

// Pull the current user's user_id (DB UUID, not pubkey) so we can stamp the
// permissions row. The pubkey is what shows up in `meta.owner`; the user_id
// is what the server's RBAC table keys on.
async function resolveMyUserId(): Promise<string | null> {
  try {
    const client = abra.client.value;
    if (!client) return null;
    const me = await client.getMe?.();
    return (me as any)?.id ?? null;
  }
  catch {
    return null;
  }
}

async function claimOwnership() {
  if (!forum.value || !perms.myPubkey.value) return;
  // 1. Stamp meta.owner so UI gates know about it.
  tree.updateMeta(forum.value.id, { owner: perms.myPubkey.value } as Record<string, unknown>);
  // 2. Set the server-side permissions row so RBAC enforces it on the wire.
  //    Owner cascades through the forum's subtree.
  const userId = await resolveMyUserId();
  const client = abra.client.value;
  if (userId && client?.setPermission) {
    try {
      await client.setPermission(forum.value.id, { user_id: userId, role: "owner" });
      toast.add({
        title: "Ownership claimed",
        description: "Server-side Owner grant set. Only you (and server admins) can edit this forum.",
        icon: "i-lucide-shield-check",
      });
      return;
    }
    catch (e) {
      toast.add({
        title: "Server-side grant failed",
        description: `meta.owner stamped, but the Owner grant didn't land: ${(e as Error).message}. UI gating still applies.`,
        color: "warning",
        icon: "i-lucide-shield-alert",
      });
      return;
    }
  }
  toast.add({
    title: "Ownership claimed (UI-only)",
    description: "meta.owner is set; sign in to also enforce ownership server-side.",
    icon: "i-lucide-shield-check",
  });
}

async function releaseOwnership() {
  if (!forum.value) return;
  tree.updateMeta(forum.value.id, { owner: undefined } as Record<string, unknown>);
  const userId = await resolveMyUserId();
  const client = abra.client.value;
  if (userId && client?.removePermission) {
    try {
      await client.removePermission(forum.value.id, { user_id: userId });
    }
    catch (e) {
      toast.add({
        title: "Server grant not revoked",
        description: `meta.owner cleared, but the permission row didn't drop: ${(e as Error).message}.`,
        color: "warning",
        icon: "i-lucide-shield-alert",
      });
      return;
    }
  }
  toast.add({ title: "Ownership released", icon: "i-lucide-shield-off" });
}

// ── Forum template export/import ───────────────────────────────────────────
// Serializes the forum's structure (forum meta + categories + boards) to
// JSON. Threads/replies are excluded — templates capture organization, not
// content. Import creates a new forum (or merges into the current one)
// from the JSON shape.

interface ForumTemplate {
  version: 1;
  exportedAt: number;
  forum: {
    label: string;
    meta: Record<string, unknown>;
  };
  categories: Array<{
    label: string;
    meta: Record<string, unknown>;
    boards: Array<{
      label: string;
      meta: Record<string, unknown>;
    }>;
  }>;
}

function buildTemplate(): ForumTemplate {
  const f = forum.value!;
  const fmeta = ({ ...(f.meta ?? {}) }) as Record<string, unknown>;
  // Don't carry an owner in templates — claim per-instance.
  delete fmeta.owner;
  return {
    version: 1,
    exportedAt: Date.now(),
    forum: {
      label: f.label,
      meta: fmeta,
    },
    categories: categories.value.map((cat) => ({
      label: cat.label,
      meta: ({ ...(cat.meta ?? {}) }) as Record<string, unknown>,
      boards: boardsOf(cat.id).map((b) => ({
        label: b.label,
        meta: ({ ...(b.meta ?? {}) }) as Record<string, unknown>,
      })),
    })),
  };
}

function exportTemplate() {
  if (!forum.value) return;
  const tpl = buildTemplate();
  const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${forum.value.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-template.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.add({ title: "Template downloaded", icon: "i-lucide-download" });
}

const importOpen = ref(false);
const importDraft = ref("");
const importErr = ref<string | null>(null);
const importMode = ref<"merge" | "replace">("merge");

function openImport() {
  importDraft.value = "";
  importErr.value = null;
  importOpen.value = true;
}

function commitImport() {
  if (!forum.value) return;
  let tpl: ForumTemplate;
  try {
    tpl = JSON.parse(importDraft.value);
  }
  catch (e) {
    importErr.value = `Invalid JSON: ${(e as Error).message}`;
    return;
  }
  if (tpl?.version !== 1 || !Array.isArray(tpl.categories)) {
    importErr.value = "Not a valid Atrium forum template (expected version: 1).";
    return;
  }

  // Replace mode: nuke existing categories & boards first.
  if (importMode.value === "replace") {
    for (const cat of categories.value) {
      tree.deleteEntry(cat.id);
    }
  }

  // Update forum meta unless we're trying to keep our own.
  if (importMode.value === "replace") {
    if (tpl.forum.label && tpl.forum.label !== forum.value.label) {
      tree.renameEntry(forum.value.id, tpl.forum.label);
    }
    tree.updateMeta(forum.value.id, tpl.forum.meta);
  }

  for (const cat of tpl.categories) {
    const catId = tree.createChild(forum.value.id, cat.label, "category");
    if (cat.meta) tree.updateMeta(catId, cat.meta);
    for (const board of cat.boards) {
      const boardId = tree.createChild(catId, board.label, "board");
      if (board.meta) tree.updateMeta(boardId, board.meta);
    }
  }

  toast.add({
    title: `Imported ${tpl.categories.length} categor${tpl.categories.length === 1 ? "y" : "ies"}`,
    description: importMode.value === "replace" ? "Replaced existing structure." : "Merged into current forum.",
    icon: "i-lucide-import",
  });
  importOpen.value = false;
}

function onImportFile(ev: Event) {
  const target = ev.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  file.text().then((txt) => {
    importDraft.value = txt;
  }).catch(() => {
    importErr.value = "Could not read file.";
  });
  target.value = "";
}

// ── Category creation / rename / remove ────────────────────────────────────
const newCategoryLabel = ref("");
function createCategory() {
  if (!forum.value) return;
  const label = newCategoryLabel.value.trim();
  if (!label) return;
  const id = tree.createChild(forum.value.id, label, "category");
  tree.updateMeta(id, { icon: "folder" });
  newCategoryLabel.value = "";
  toast.add({ title: `Category "${label}" added`, icon: "i-lucide-folder-plus" });
}

const renamingId = ref<string | null>(null);
const renameDraft = ref("");
function startRename(id: string, current: string) {
  renamingId.value = id;
  renameDraft.value = current;
}
function commitRename() {
  if (!renamingId.value) return;
  const next = renameDraft.value.trim();
  if (next) tree.renameEntry(renamingId.value, next);
  renamingId.value = null;
}

// ── Board creation under a category ────────────────────────────────────────
const newBoardLabel = ref<Record<string, string>>({});
function createBoard(catId: string) {
  const label = (newBoardLabel.value[catId] ?? "").trim();
  if (!label) return;
  const id = tree.createChild(catId, label, "board");
  tree.updateMeta(id, { icon: "message-square-text" });
  newBoardLabel.value[catId] = "";
  toast.add({ title: `Board "${label}" added`, icon: "i-lucide-hash" });
}

// ── Delete confirm ─────────────────────────────────────────────────────────
const confirmOpen = ref(false);
const pending = ref<{ id: string; label: string; kind: "category" | "board" } | null>(null);
function askDelete(id: string, label: string, kind: "category" | "board") {
  pending.value = { id, label, kind };
  confirmOpen.value = true;
}
function commitDelete() {
  if (!pending.value) return;
  tree.deleteEntry(pending.value.id);
  toast.add({
    title: `${pending.value.kind === "category" ? "Category" : "Board"} "${pending.value.label}" deleted`,
    icon: "i-lucide-trash-2",
  });
  confirmOpen.value = false;
  pending.value = null;
}

useHead(() => ({
  title: `${forum.value?.label ?? "Forum"} · Admin · Atrium`,
}));
</script>

<template>
  <div class="atrium-fadmin">
    <header class="atrium-fadmin__head">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-chevron-left"
        @click="router.push(`/f/${forumId}`)"
      >
        Back to forum
      </UButton>
      <h1 class="text-2xl font-semibold leading-tight flex items-center gap-2">
        <UIcon name="i-lucide-shield" class="size-6 text-primary" />
        Admin · {{ forum?.label ?? "Forum" }}
      </h1>
      <p class="text-sm text-dimmed">
        Rename the forum, set the icon, and manage its categories and boards. Changes sync to every peer immediately.
      </p>
    </header>

    <ClientOnly>
      <section v-if="!forum" class="atrium-fadmin__empty">
        <UIcon name="i-lucide-help-circle" class="size-8 text-dimmed" />
        <p>This forum doesn't exist or hasn't synced yet.</p>
      </section>

      <section v-else-if="!canAdmin && treeLoaded" class="atrium-fadmin__deny">
        <UIcon name="i-lucide-shield-off" class="size-10 text-warning" />
        <h2>You can't manage this forum</h2>
        <p>
          Admin tools are available to the forum owner and server-side admins.
          Your current role:
          <UBadge color="neutral" variant="subtle" size="sm">
            {{ perms.role.value ?? "guest" }}
          </UBadge>
        </p>
        <p class="text-sm text-dimmed">
          If you should have admin access, ask the owner to grant your pubkey
          (<code>{{ perms.myPubkey.value.slice(0, 12) }}…</code>) or update the
          forum's <code>meta.owner</code> field.
        </p>
        <UButton color="neutral" variant="soft" icon="i-lucide-arrow-left" @click="router.push(`/f/${forumId}`)">
          Back to forum
        </UButton>
      </section>

      <template v-else>
        <!-- Forum metadata -->
        <section class="atrium-fadmin__section">
          <div class="atrium-fadmin__section-head">
            <UIcon name="i-lucide-edit-3" class="size-4 text-primary" />
            <h2>Forum details</h2>
          </div>
          <div class="atrium-fadmin__row">
            <label for="fadmin-label" class="atrium-fadmin__label">
              Name
              <span class="atrium-fadmin__hint">Shown in the rail, breadcrumb, and share cards.</span>
            </label>
            <UInput id="fadmin-label" v-model="labelDraft" class="flex-1 max-w-md" />
          </div>
          <div class="atrium-fadmin__row">
            <label for="fadmin-subtitle" class="atrium-fadmin__label">
              Subtitle
              <span class="atrium-fadmin__hint">One-line description shown under the forum name.</span>
            </label>
            <UInput id="fadmin-subtitle" v-model="subtitleDraft" class="flex-1 max-w-md" />
          </div>
          <div class="atrium-fadmin__row">
            <label for="fadmin-icon" class="atrium-fadmin__label">
              Icon
              <span class="atrium-fadmin__hint">Lucide icon name (kebab-case), e.g. <code>message-square</code>.</span>
            </label>
            <div class="flex items-center gap-2 flex-1 max-w-md">
              <UIcon :name="`i-lucide-${iconDraft}`" class="size-5 text-primary shrink-0" />
              <UInput v-model="iconDraft" class="flex-1" placeholder="message-square" />
            </div>
          </div>
          <div class="atrium-fadmin__row">
            <span class="atrium-fadmin__label" />
            <UButton color="primary" variant="soft" icon="i-lucide-save" @click="saveForumMeta">
              Save forum details
            </UButton>
          </div>
        </section>

        <!-- Theme -->
        <section class="atrium-fadmin__section">
          <div class="atrium-fadmin__section-head">
            <UIcon name="i-lucide-paintbrush" class="size-4 text-primary" />
            <h2>Theme</h2>
          </div>
          <div class="atrium-fadmin__row">
            <label class="atrium-fadmin__label">
              Accent color
              <span class="atrium-fadmin__hint">
                Tints the chrome while inside this forum. Personal accent colors override per user.
              </span>
            </label>
            <div class="atrium-fadmin__swatches">
              <button
                v-for="c in COLOR_SWATCHES"
                :key="c"
                type="button"
                class="atrium-fadmin__swatch"
                :class="{ 'atrium-fadmin__swatch--active': colorDraft === c }"
                :style="{ background: `var(--color-${c}-500)` }"
                :aria-label="c"
                :title="c"
                @click="pickAccent(c)"
              />
              <button
                type="button"
                class="atrium-fadmin__swatch atrium-fadmin__swatch--clear"
                :class="{ 'atrium-fadmin__swatch--active': !colorDraft }"
                aria-label="No tint"
                title="No tint"
                @click="pickAccent('')"
              >
                <UIcon name="i-lucide-circle-slash" class="size-4" />
              </button>
            </div>
          </div>
          <div class="atrium-fadmin__row">
            <label for="fadmin-banner" class="atrium-fadmin__label">
              Banner copy
              <span class="atrium-fadmin__hint">
                Short greeting shown above categories on the forum index. Leave empty to hide.
              </span>
            </label>
            <UTextarea
              id="fadmin-banner"
              v-model="bannerDraft"
              :rows="2"
              placeholder="Welcome message, rules link, vibe-setter…"
              class="flex-1 max-w-md"
            />
          </div>
          <div class="atrium-fadmin__row">
            <span class="atrium-fadmin__label" />
            <UButton color="primary" variant="soft" icon="i-lucide-save" @click="saveForumMeta">
              Save theme
            </UButton>
          </div>
        </section>

        <section class="atrium-fadmin__section">
          <div class="atrium-fadmin__section-head">
            <UIcon name="i-lucide-shield" class="size-4 text-primary" />
            <h2>Ownership</h2>
          </div>
          <template v-if="!currentOwner">
            <UAlert
              icon="i-lucide-shield-question"
              color="warning"
              variant="subtle"
              title="Unclaimed forum"
              description="No owner is recorded yet. Right now anyone signed in can edit this forum. Claim ownership to lock admin access to your pubkey."
            />
            <div class="atrium-fadmin__row">
              <span class="atrium-fadmin__label" />
              <UButton color="primary" icon="i-lucide-shield-check" @click="claimOwnership">
                Claim ownership
              </UButton>
            </div>
          </template>
          <template v-else>
            <div class="atrium-fadmin__row">
              <span class="atrium-fadmin__label">
                Recorded owner
                <span class="atrium-fadmin__hint">Only this pubkey (plus server admins) can edit this forum.</span>
              </span>
              <code class="atrium-fadmin__pubkey truncate">{{ currentOwner }}</code>
            </div>
            <div v-if="currentOwner === perms.myPubkey.value" class="atrium-fadmin__row">
              <span class="atrium-fadmin__label" />
              <UButton color="warning" variant="soft" icon="i-lucide-shield-off" @click="releaseOwnership">
                Release ownership
              </UButton>
            </div>
          </template>
        </section>

        <!-- Categories + boards -->
        <section class="atrium-fadmin__section">
          <div class="atrium-fadmin__section-head">
            <UIcon name="i-lucide-folder-tree" class="size-4 text-primary" />
            <h2>Categories &amp; boards</h2>
            <UBadge color="neutral" variant="subtle" size="sm" class="ml-auto">
              {{ categories.length }} categor{{ categories.length === 1 ? "y" : "ies" }}
            </UBadge>
          </div>

          <div v-for="cat in categories" :key="cat.id" class="atrium-fadmin__cat">
            <header class="atrium-fadmin__cat-head">
              <UIcon name="i-lucide-folder" class="size-4 text-dimmed shrink-0" />
              <template v-if="renamingId === cat.id">
                <UInput
                  v-model="renameDraft"
                  autofocus
                  size="sm"
                  class="flex-1 max-w-sm"
                  @keydown.enter="commitRename"
                  @blur="commitRename"
                />
              </template>
              <template v-else>
                <button
                  type="button"
                  class="atrium-fadmin__cat-name truncate flex-1 text-left"
                  @click="startRename(cat.id, cat.label)"
                >
                  {{ cat.label }}
                </button>
              </template>
              <UButton
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-trash-2"
                aria-label="Delete category"
                @click="askDelete(cat.id, cat.label, 'category')"
              />
            </header>

            <ul class="atrium-fadmin__boards">
              <li v-for="board in boardsOf(cat.id)" :key="board.id" class="atrium-fadmin__board">
                <UIcon name="i-lucide-hash" class="size-3.5 text-dimmed shrink-0" />
                <template v-if="renamingId === board.id">
                  <UInput
                    v-model="renameDraft"
                    autofocus
                    size="sm"
                    class="flex-1 max-w-xs"
                    @keydown.enter="commitRename"
                    @blur="commitRename"
                  />
                </template>
                <template v-else>
                  <button
                    type="button"
                    class="atrium-fadmin__cat-name truncate flex-1 text-left text-sm"
                    @click="startRename(board.id, board.label)"
                  >
                    {{ board.label }}
                  </button>
                </template>
                <UBadge color="neutral" variant="subtle" size="sm">
                  {{ nav.threadsForBoard(board.id).length }} threads
                </UBadge>
                <UButton
                  color="error"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-trash-2"
                  aria-label="Delete board"
                  @click="askDelete(board.id, board.label, 'board')"
                />
              </li>
              <li class="atrium-fadmin__add">
                <UInput
                  v-model="newBoardLabel[cat.id]"
                  size="sm"
                  placeholder="New board name…"
                  class="flex-1 max-w-xs"
                  @keydown.enter="createBoard(cat.id)"
                />
                <UButton
                  size="sm"
                  color="primary"
                  variant="soft"
                  icon="i-lucide-plus"
                  :disabled="!(newBoardLabel[cat.id] ?? '').trim()"
                  @click="createBoard(cat.id)"
                >
                  Add board
                </UButton>
              </li>
            </ul>
          </div>

          <div class="atrium-fadmin__add atrium-fadmin__add--cat">
            <UIcon name="i-lucide-folder-plus" class="size-4 text-primary shrink-0" />
            <UInput
              v-model="newCategoryLabel"
              size="md"
              placeholder="New category name…"
              class="flex-1 max-w-sm"
              @keydown.enter="createCategory"
            />
            <UButton
              color="primary"
              icon="i-lucide-plus"
              :disabled="!newCategoryLabel.trim()"
              @click="createCategory"
            >
              Add category
            </UButton>
          </div>
        </section>

        <!-- Import / Export -->
        <section class="atrium-fadmin__section">
          <div class="atrium-fadmin__section-head">
            <UIcon name="i-lucide-file-json" class="size-4 text-primary" />
            <h2>Template &amp; portability</h2>
          </div>
          <p class="text-sm text-dimmed">
            Export the forum's structure (categories, boards, metadata) to a
            JSON template you can import into another forum. Threads and
            replies are not included — templates capture organization only.
          </p>
          <div class="atrium-fadmin__row">
            <span class="atrium-fadmin__label">
              Export structure
              <span class="atrium-fadmin__hint">Downloads a <code>.json</code> file.</span>
            </span>
            <UButton color="neutral" variant="soft" icon="i-lucide-download" @click="exportTemplate">
              Download template
            </UButton>
          </div>
          <div class="atrium-fadmin__row">
            <span class="atrium-fadmin__label">
              Import structure
              <span class="atrium-fadmin__hint">Merge into or replace the current forum.</span>
            </span>
            <UButton color="primary" variant="soft" icon="i-lucide-upload" @click="openImport">
              Import template…
            </UButton>
          </div>
        </section>
      </template>

      <template #fallback>
        <div class="flex justify-center py-16">
          <UIcon name="i-lucide-loader-circle" class="size-6 text-dimmed animate-spin" />
        </div>
      </template>
    </ClientOnly>

    <UModal v-model:open="importOpen" :ui="{ content: 'max-w-2xl' }">
      <template #header>
        <p class="font-semibold">Import forum template</p>
      </template>
      <template #body>
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-3">
            <span class="text-sm">Mode:</span>
            <UButtonGroup>
              <UButton
                :color="importMode === 'merge' ? 'primary' : 'neutral'"
                :variant="importMode === 'merge' ? 'soft' : 'ghost'"
                icon="i-lucide-git-merge"
                size="sm"
                @click="importMode = 'merge'"
              >
                Merge
              </UButton>
              <UButton
                :color="importMode === 'replace' ? 'primary' : 'neutral'"
                :variant="importMode === 'replace' ? 'soft' : 'ghost'"
                icon="i-lucide-replace"
                size="sm"
                @click="importMode = 'replace'"
              >
                Replace
              </UButton>
            </UButtonGroup>
            <span class="text-xs text-dimmed">
              {{ importMode === 'merge'
                ? 'Append the template categories alongside existing ones.'
                : 'Delete current structure first, then apply the template.' }}
            </span>
          </div>
          <label class="atrium-fadmin__import-pick">
            <UIcon name="i-lucide-file-up" class="size-4 text-primary" />
            <span>Pick a JSON file…</span>
            <input
              type="file"
              accept="application/json,.json"
              class="hidden"
              @change="onImportFile"
            >
          </label>
          <UTextarea
            v-model="importDraft"
            :rows="14"
            placeholder="Or paste template JSON here…"
            :ui="{ base: 'font-mono text-xs' }"
          />
          <UAlert
            v-if="importErr"
            icon="i-lucide-circle-x"
            color="error"
            variant="subtle"
            :description="importErr"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="importOpen = false">
            Cancel
          </UButton>
          <UButton color="primary" :disabled="!importDraft.trim()" @click="commitImport">
            {{ importMode === 'replace' ? 'Replace with template' : 'Merge template in' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="confirmOpen" :ui="{ content: 'max-w-md' }">
      <template #header>
        <p class="font-semibold">
          Delete {{ pending?.kind }} "{{ pending?.label }}"?
        </p>
      </template>
      <template #body>
        <p class="text-sm">
          Everything inside —
          <template v-if="pending?.kind === 'category'">boards, threads, replies</template>
          <template v-else>threads, replies, reactions</template>
          — moves to the trash. Peers see the change immediately. This can be recovered by an admin from the trash store.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="confirmOpen = false">
            Cancel
          </UButton>
          <UButton color="error" @click="commitDelete">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.atrium-fadmin {
  max-width: 60rem;
  margin: 0 auto;
  width: 100%;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.atrium-fadmin__head {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: flex-start;
}
.atrium-fadmin__section {
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-lg, 1rem);
  background: var(--ui-bg);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
}
.atrium-fadmin__section-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--ui-border);
  padding-bottom: 0.65rem;
}
.atrium-fadmin__section-head h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
.atrium-fadmin__row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.atrium-fadmin__label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.875rem;
  font-weight: 500;
  flex: 0 0 12rem;
  max-width: 14rem;
}
.atrium-fadmin__hint {
  font-size: 0.75rem;
  color: var(--ui-text-dimmed);
  font-weight: 400;
}
.atrium-fadmin__hint code,
.atrium-fadmin__pubkey {
  background: color-mix(in srgb, var(--ui-text-dimmed) 12%, transparent);
  padding: 0.05rem 0.3rem;
  border-radius: 0.3rem;
  font-family: var(--font-mono, ui-monospace);
}
.atrium-fadmin__pubkey {
  font-size: 0.75rem;
  flex: 1;
  min-width: 0;
}
.atrium-fadmin__import-pick {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.8rem;
  border: 1px dashed var(--ui-border);
  border-radius: var(--atrium-radius-sm, 0.4rem);
  cursor: pointer;
  font-size: 0.825rem;
  color: var(--ui-text-dimmed);
  transition: background 0.15s ease, color 0.15s ease;
  width: fit-content;
}
.atrium-fadmin__import-pick:hover {
  background: color-mix(in srgb, var(--ui-primary) 6%, transparent);
  color: var(--ui-text);
}
.atrium-fadmin__swatches {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.45rem;
  max-width: 24rem;
  flex: 1;
}
.atrium-fadmin__swatch {
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, black 20%, transparent);
  border-radius: var(--atrium-radius-sm, 0.4rem);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.atrium-fadmin__swatch:hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 30%, transparent);
}
.atrium-fadmin__swatch--active {
  box-shadow:
    0 0 0 2px var(--ui-bg),
    0 0 0 4px var(--ui-primary);
}
.atrium-fadmin__swatch--clear {
  background: transparent;
  color: var(--ui-text-dimmed);
  border-style: dashed;
}
.atrium-fadmin__cat {
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-md, 0.65rem);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.atrium-fadmin__cat + .atrium-fadmin__cat {
  margin-top: 0.6rem;
}
.atrium-fadmin__cat-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  background: color-mix(in srgb, var(--ui-primary) 4%, transparent);
  border-bottom: 1px solid var(--ui-border);
}
.atrium-fadmin__cat-name {
  border: none;
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  color: inherit;
}
.atrium-fadmin__cat-name:hover {
  color: var(--ui-primary);
}
.atrium-fadmin__boards {
  list-style: none;
  margin: 0;
  padding: 0;
}
.atrium-fadmin__board,
.atrium-fadmin__add {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.85rem;
  border-top: 1px solid var(--ui-border);
}
.atrium-fadmin__boards li:first-child {
  border-top: none;
}
.atrium-fadmin__add {
  background: color-mix(in srgb, var(--ui-primary) 2%, transparent);
}
.atrium-fadmin__add--cat {
  border: 1px dashed var(--ui-border);
  border-radius: var(--atrium-radius-md, 0.65rem);
  padding: 0.7rem 0.85rem;
}
.atrium-fadmin__empty,
.atrium-fadmin__deny {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 3rem 1.5rem;
  border: 1px dashed var(--ui-border);
  border-radius: var(--atrium-radius-lg, 1rem);
  text-align: center;
}
.atrium-fadmin__deny h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}
.atrium-fadmin__deny p {
  font-size: 0.875rem;
  max-width: 32rem;
}
.atrium-fadmin__deny code {
  background: color-mix(in srgb, var(--ui-text-dimmed) 12%, transparent);
  padding: 0.05rem 0.3rem;
  border-radius: 0.3rem;
  font-family: var(--font-mono, ui-monospace);
}
</style>
