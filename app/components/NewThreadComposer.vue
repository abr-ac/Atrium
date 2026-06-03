<script setup lang="ts">
// NewThreadComposer — inline at the top of /b/[id], not a modal. Compact
// CTA expands into a title + body (AEditor on a draft tree entry) + tags
// + submit. On post, the entry's draft flag drops and we navigate into it.
//
// Mirrors ReplyComposer's draft-then-publish flow: a thread entry is
// created on first interaction with type='thread' meta.draft=true, hidden
// from non-author viewers in the board's thread list. Auto-saving inline.

const props = defineProps<{
  boardId: string;
  boardLabel: string;
  autoExpand?: boolean;
}>();

const emit = defineEmits<{ created: [id: string] }>();

const { doc, provider, client, publicKeyB64 } = useAbracadabra();
const tree = useChildTree(doc, props.boardId);
const toast = useToast();
const viewport = useAtriumViewport();

const expanded = ref(false);
const draftId = ref<string | null>(null);
const title = ref("");
const tagsInput = ref("");
const editorReady = ref(false);
const posting = ref(false);
const editorRef = ref<any>(null);
const titleInputRef = ref<HTMLInputElement | null>(null);

// Drop-to-attach state
const dropActive = ref(false);
let dragCounter = 0;
const uploadingCount = ref(0);

function parseTags(raw: string): string[] {
  return raw
    .split(/[,\s]+/g)
    .map((t) => t.trim().replace(/^#/, "").toLowerCase())
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

async function expand() {
  if (expanded.value) return;
  expanded.value = true;
  // Pre-create the draft entry so AEditor mounts immediately. The thread
  // list filters drafts from non-author views.
  const id = tree.createChild(props.boardId, "(draft)", "thread");
  tree.updateMeta(id, {
    draft: true,
    author: publicKeyB64.value,
    priority: 0,
    status: "open",
  } as Record<string, unknown>);
  draftId.value = id;
  await nextTick();
  titleInputRef.value?.focus();
}

function discard() {
  if (draftId.value) tree.deleteEntry(draftId.value);
  draftId.value = null;
  title.value = "";
  tagsInput.value = "";
  expanded.value = false;
  editorReady.value = false;
}

const onlinePeers = useAtriumOnlinePeers();

async function publish() {
  if (!draftId.value || posting.value) return;
  if (!title.value.trim()) {
    titleInputRef.value?.focus();
    return;
  }
  posting.value = true;
  try {
    // Snapshot online peers when the title or body mentions @here so the
    // notify runner can fan-out to the live set instead of every author.
    const me = publicKeyB64.value;
    const text = `${title.value} ${editorRef.value?.editor?.state?.doc?.textBetween?.(0, 1000) ?? ""}`;
    const hereTargets = /@here\b/.test(text)
      ? onlinePeers.snapshot().filter((p) => p !== me)
      : undefined;
    tree.renameEntry(draftId.value, title.value.trim());
    tree.updateMeta(draftId.value, {
      draft: false,
      hasRichBody: true,
      tags: parseTags(tagsInput.value),
      ...(hereTargets ? { notifyHere: hereTargets } : {}),
    } as Record<string, unknown>);
    const createdId = draftId.value;
    draftId.value = null;
    title.value = "";
    tagsInput.value = "";
    expanded.value = false;
    editorReady.value = false;
    emit("created", createdId);
  }
  finally {
    posting.value = false;
  }
}

function onKeydown(ev: KeyboardEvent) {
  if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
    ev.preventDefault();
    publish();
  }
  else if (ev.key === "Escape" && expanded.value) {
    ev.preventDefault();
    if (!title.value.trim()) discard();
  }
  // The floating mention picker handles @-typing inline via the editor's
  // transaction stream — no manual trigger needed here.
}

// @-mentions are owned by AEditor's UEditorMentionMenu; atrium contributes
// peers via the atrium-mentions Nuxt plugin. The toolbar button below
// inserts an "@" at the caret to open the native suggestion popup.
function openMention() {
  const editor = editorRef.value?.editor;
  if (!editor) return;
  editor.chain().focus().insertContent("@").run();
}

onMounted(() => {
  if (props.autoExpand) void expand();
});

// ── Drop-to-attach ──────────────────────────────────────────────────────────
function onDragEnter(ev: DragEvent) {
  if (!ev.dataTransfer?.types?.includes("Files")) return;
  ev.preventDefault();
  dragCounter += 1;
  dropActive.value = true;
}
function onDragOver(ev: DragEvent) {
  if (ev.dataTransfer?.types?.includes("Files")) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
  }
}
function onDragLeave() {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) dropActive.value = false;
}
async function uploadAndInsert(file: File) {
  if (!draftId.value || !client.value) return;
  uploadingCount.value += 1;
  try {
    const meta = await client.value.upload(draftId.value, file, file.name);
    const baseUrl = (client.value as any).baseUrl ?? "";
    const url = `${baseUrl}/docs/${encodeURIComponent(draftId.value)}/uploads/${(meta as any).id}`;
    const editor = editorRef.value?.editor;
    if (!editor) return;
    const isImage = file.type.startsWith("image/");
    if (isImage && editor.commands?.setImage) {
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    }
    else if (isImage) {
      editor.chain().focus().insertContent(`<img src="${url}" alt="${file.name}" />`).run();
    }
    else {
      editor.chain().focus().insertContent(`<p>📎 <a href="${url}" target="_blank">${file.name}</a></p>`).run();
    }
  }
  catch (e) {
    toast.add({
      title: "Upload failed",
      description: (e as Error).message,
      color: "error",
      icon: "i-lucide-circle-x",
    });
  }
  finally {
    uploadingCount.value -= 1;
  }
}
async function onDrop(ev: DragEvent) {
  ev.preventDefault();
  dragCounter = 0;
  dropActive.value = false;
  if (!expanded.value) await expand();
  await nextTick();
  const files = Array.from(ev.dataTransfer?.files ?? []);
  for (const f of files) {
    await uploadAndInsert(f);
  }
}

const tagPreview = computed(() => parseTags(tagsInput.value));
</script>

<template>
  <div
    class="atrium-newthread"
    :class="{
      'atrium-newthread--expanded': expanded,
      'atrium-newthread--drop': dropActive,
      'atrium-newthread--mobile': viewport.isMobile.value && expanded,
    }"
    @keydown="onKeydown"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div v-if="dropActive" class="atrium-newthread__dropmask">
      <UIcon name="i-lucide-image-plus" class="size-7 text-primary" />
      <p>Drop to attach to your new thread</p>
    </div>

    <button
      v-if="!expanded"
      type="button"
      class="atrium-newthread__cta"
      @click="expand"
    >
      <UIcon name="i-lucide-message-square-plus" class="size-4 text-primary" />
      <span class="text-sm">Start a new thread in <span class="text-default font-medium">#{{ boardLabel }}</span>…</span>
      <UKbd class="ml-auto">N</UKbd>
    </button>

    <template v-else>
      <header class="atrium-newthread__head">
        <UIcon name="i-lucide-pencil" class="size-4 text-primary" />
        <span class="text-sm font-medium">New thread in #{{ boardLabel }}</span>
        <span class="ml-auto text-xs text-dimmed flex items-center gap-1">
          <UIcon
            v-if="uploadingCount > 0"
            name="i-lucide-loader-circle"
            class="size-3 animate-spin text-primary"
          />
          <template v-if="uploadingCount > 0">Uploading {{ uploadingCount }}…</template>
          <template v-else>Auto-saving…</template>
        </span>
      </header>

      <input
        ref="titleInputRef"
        v-model="title"
        type="text"
        class="atrium-newthread__title"
        placeholder="What's this thread about?"
      />

      <ClientOnly>
        <AtriumPostEditor
          v-if="draftId"
          ref="editorRef"
          :doc-id="draftId"
          editable
          compact
          placeholder="Set the stage. (⌘/Ctrl+Enter to post · / for slash menu · drag a file to attach)"
          @ready="editorReady = true"
        />
      </ClientOnly>

      <div class="atrium-newthread__tags">
        <UIcon name="i-lucide-tag" class="size-3.5 text-dimmed shrink-0" />
        <input
          v-model="tagsInput"
          type="text"
          class="atrium-newthread__tagsInput"
          placeholder="Add tags · comma- or space-separated · up to 6"
        />
        <div v-if="tagPreview.length" class="atrium-newthread__tagChips">
          <UBadge
            v-for="tag in tagPreview"
            :key="tag"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            #{{ tag }}
          </UBadge>
        </div>
      </div>

      <footer class="atrium-newthread__foot">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-x"
          @click="discard"
        >
          Discard
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-at-sign"
          aria-label="Mention someone"
          title="Mention someone"
          @click="openMention"
        />
        <AtriumInsertMenu
          :editor="editorRef?.editor ?? null"
          :parent-doc-id="draftId"
        />
        <span class="text-xs text-dimmed mx-auto hidden sm:inline">
          ⌘/Ctrl+Enter to post · esc to discard if empty
        </span>
        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-send-horizontal"
          :loading="posting"
          :disabled="!editorReady || !title.trim()"
          @click="publish"
        >
          Post thread
        </UButton>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.atrium-newthread {
  position: relative;
  width: 100%;
}
.atrium-newthread__cta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.8rem 1rem;
  border: 1px dashed var(--ui-border);
  border-radius: 0.65rem;
  background: transparent;
  color: var(--ui-text-dimmed);
  cursor: text;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}
.atrium-newthread__cta:hover {
  background: color-mix(in srgb, var(--ui-primary) 5%, transparent);
  border-color: color-mix(in srgb, var(--ui-primary) 40%, var(--ui-border));
  color: var(--ui-text);
}
.atrium-newthread--expanded {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.85rem 1rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--ui-primary) 30%, var(--ui-border));
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--ui-primary) 3%, var(--ui-bg));
}
.atrium-newthread__head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.atrium-newthread__title {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  padding: 0.35rem 0;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: inherit;
}
.atrium-newthread__title::placeholder {
  color: var(--ui-text-dimmed);
  font-weight: 500;
}
.atrium-newthread__tags {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-top: 1px solid color-mix(in srgb, var(--ui-primary) 14%, var(--ui-border));
  padding-top: 0.5rem;
  flex-wrap: wrap;
}
.atrium-newthread__tagsInput {
  flex: 1;
  min-width: 10rem;
  background: transparent;
  border: none;
  outline: none;
  font-size: 0.8125rem;
  color: inherit;
}
.atrium-newthread__tagsInput::placeholder {
  color: var(--ui-text-dimmed);
}
.atrium-newthread__tagChips {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.atrium-newthread__foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.35rem;
  border-top: 1px solid color-mix(in srgb, var(--ui-primary) 14%, var(--ui-border));
}
.atrium-newthread--drop {
  outline: 2px dashed color-mix(in srgb, var(--ui-primary) 60%, transparent);
  outline-offset: 4px;
}
.atrium-newthread__dropmask {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  background: color-mix(in srgb, var(--ui-primary) 15%, var(--ui-bg));
  border-radius: 0.55rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ui-primary);
  pointer-events: none;
}
/* On mobile, the expanded composer takes over the viewport bottom-up so
   the title input + body editor get full width and the on-screen keyboard
   has room. Inline CTA stays unchanged (collapsed). */
.atrium-newthread--mobile {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: var(--ui-bg);
  border-radius: 0;
  overflow-y: auto;
  padding: 1rem 1rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.atrium-newthread--mobile .atrium-newthread__title {
  font-size: 1.4rem;
}
.atrium-newthread--mobile .atrium-newthread__foot {
  position: sticky;
  bottom: 0;
  background: var(--ui-bg);
  padding-top: 0.6rem;
}
</style>
