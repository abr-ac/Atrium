<script setup lang="ts">
// ReplyComposer — draft-then-publish flow on top of the rich TipTap editor.
//
// Click "Start writing" → we create a tree entry with type='reply' and
// meta.draft=true so the reply is hidden from non-author viewers (filtered
// in t/[id].vue). AEditor mounts against the draft's docId; the body lives
// in its own Y.XmlFragment so collab carets, mentions, slash commands, code
// blocks all work out of the box.
//
// On "Post", we clear meta.draft and compute label = body's first line
// summary. On "Discard", we deleteEntry() the draft (descendants — there
// aren't any yet — go to trash).

const props = defineProps<{
  threadId: string;
  replyToId?: string | null;
}>();

const { doc, provider, client, publicKeyB64 } = useAbracadabra();
const tree = useChildTree(doc, props.threadId);
const toast = useToast();
const typing = useAtriumTyping();
const viewport = useAtriumViewport();

const draftId = ref<string | null>(null);
const editorReady = ref(false);
const posting = ref(false);
const editorRef = ref<any>(null);

// Re-stamp every couple of seconds while drafting so peers' TTL stays warm.
let typingTimer: ReturnType<typeof setInterval> | null = null;
function startTypingHeartbeat() {
  if (typingTimer) return;
  typing.setTypingIn(props.threadId);
  typingTimer = setInterval(() => typing.setTypingIn(props.threadId), 3000);
}
function stopTypingHeartbeat() {
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }
  typing.setTypingIn(null);
}
watch(draftId, (id) => {
  if (id) startTypingHeartbeat();
  else stopTypingHeartbeat();
});
onScopeDispose(stopTypingHeartbeat);

// Drop-zone state for the composer panel.
const dropActive = ref(false);
let dragCounter = 0;
const uploadingCount = ref(0);

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
  if (!draftId.value) startDraft();
  await nextTick();
  const files = Array.from(ev.dataTransfer?.files ?? []);
  for (const f of files) {
    await uploadAndInsert(f);
  }
}

function startDraft() {
  if (draftId.value) return;
  const parentId = props.replyToId ?? props.threadId;
  const id = tree.createChild(parentId, "(draft)", "reply");
  tree.updateMeta(id, {
    draft: true,
    author: publicKeyB64.value,
  } as Record<string, unknown>);
  draftId.value = id;
  editorReady.value = false;
}

// Focus the editor as soon as it's ready — clicking the Reply CTA opens a
// draft and expects the caret to land in the body without a second tap.
watch(editorReady, (ready) => {
  if (!ready) return;
  nextTick(() => {
    editorRef.value?.editor?.chain().focus().run();
  });
});

function discardDraft() {
  if (!draftId.value) return;
  tree.deleteEntry(draftId.value);
  draftId.value = null;
  editorReady.value = false;
}

function summarizeBody(): string {
  // Read the AEditor's Y.Doc body via the provider and derive a first-line
  // summary. AEditor stores TipTap content in a Y.XmlFragment on the child
  // doc; we pull `textContent` for a plain-text summary.
  const id = draftId.value;
  if (!id || !doc.value) return "(reply)";
  const provider = (useAbracadabra().provider as { value?: any }).value;
  try {
    const child = provider?.getChild?.(id);
    const childDoc = child?.document ?? child?.doc;
    if (childDoc) {
      const xml = childDoc.getXmlFragment("default") as any;
      const text = xml?.toString?.() ?? "";
      // Strip XML tags; first 120 chars of the first line.
      const plain = text
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const firstLine = plain.split("\n")[0] ?? "";
      return firstLine.length > 120
        ? `${firstLine.slice(0, 117)}…`
        : firstLine || "(reply)";
    }
  }
  catch (e) {
    if (import.meta.dev) console.warn("[ReplyComposer] failed to summarize body:", e);
  }
  return "(reply)";
}

const onlinePeers = useAtriumOnlinePeers();

async function publish() {
  if (!draftId.value || posting.value) return;
  posting.value = true;
  try {
    const summary = summarizeBody();
    // When the body contains @here, snapshot the currently-online peers
    // (minus me) so the notify runner can fan-out to that exact set
    // instead of every author seen in the forum.
    const me = publicKeyB64.value;
    const hereTargets = /@here\b/.test(summary)
      ? onlinePeers.snapshot().filter((p) => p !== me)
      : undefined;
    tree.renameEntry(draftId.value, summary);
    tree.updateMeta(draftId.value, {
      draft: false,
      hasRichBody: true,
      ...(hereTargets ? { notifyHere: hereTargets } : {}),
    } as Record<string, unknown>);
    draftId.value = null;
    editorReady.value = false;
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
}

// @-mentions are handled natively by AEditor's UEditorMentionMenu — atrium
// contributes the peer list via the atrium-mentions Nuxt plugin
// (registers an AbracadabraMentionProvider through the before-boot hook).
// Typing `@` in the editor opens the suggestion popup automatically.

function onComposerKeydown(ev: KeyboardEvent) {
  onKeydown(ev);
}

function openMention() {
  // Toolbar button still works — insert "@" at the caret so AEditor's
  // mention plugin opens its native suggestion popup at that position.
  const editor = editorRef.value?.editor;
  if (!editor) return;
  editor.chain().focus().insertContent("@").run();
}

// If the route changes / page unmounts, leave the draft alone — the user
// might come back. Drafts are filtered from view for non-authors so they
// won't leak.
</script>

<template>
  <div
    class="atrium-composer"
    :class="{
      'atrium-composer--drop': dropActive,
      'atrium-composer--mobile': viewport.isMobile.value && !!draftId,
    }"
    @keydown="onComposerKeydown"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div v-if="dropActive" class="atrium-composer__dropmask">
      <UIcon name="i-lucide-image-plus" class="size-7 text-primary" />
      <p>Drop to attach</p>
    </div>
    <template v-if="!draftId">
      <button
        type="button"
        class="atrium-composer__cta"
        @click="startDraft"
      >
        <UIcon name="i-lucide-message-square-plus" class="size-4 text-primary" />
        <span>Reply to this thread…</span>
        <UKbd class="ml-auto">Enter</UKbd>
      </button>
    </template>
    <template v-else>
      <div class="atrium-composer__editor-wrap">
        <header class="atrium-composer__head">
          <UIcon name="i-lucide-pencil" class="size-3.5 text-primary" />
          <span class="text-xs font-medium">
            <template v-if="replyToId">Replying inline · adds a quote chip</template>
            <template v-else>Drafting a reply</template>
          </span>
          <span class="ml-auto text-xs text-dimmed flex items-center gap-1">
            <UIcon
              v-if="uploadingCount > 0"
              name="i-lucide-loader-circle"
              class="size-3 animate-spin text-primary"
            />
            <template v-if="uploadingCount > 0">
              Uploading {{ uploadingCount }}…
            </template>
            <template v-else>Auto-saving…</template>
          </span>
        </header>
        <ClientOnly>
          <AtriumPostEditor
            ref="editorRef"
            :doc-id="draftId"
            editable
            compact
            placeholder="What's on your mind? (⌘/Ctrl+Enter to post · / for slash menu · drag a file to attach)"
            @ready="editorReady = true"
          />
        </ClientOnly>
        <footer class="atrium-composer__foot">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-trash-2"
            @click="discardDraft"
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
          <span class="text-xs text-dimmed mx-auto">
            Markdown · / for blocks · @ for mentions
          </span>
          <UButton
            color="primary"
            size="sm"
            icon="i-lucide-send-horizontal"
            :loading="posting"
            :disabled="!editorReady"
            @click="publish"
          >
            Post reply
          </UButton>
        </footer>
      </div>
    </template>
  </div>
</template>

<style scoped>
.atrium-composer {
  width: 100%;
  position: relative;
}
.atrium-composer--drop {
  outline: 2px dashed color-mix(in srgb, var(--ui-primary) 60%, transparent);
  outline-offset: 4px;
  border-radius: 0.65rem;
}
.atrium-composer__dropmask {
  position: absolute;
  inset: 0;
  z-index: 4;
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
.atrium-composer__cta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.7rem 0.9rem;
  border: 1px dashed var(--ui-border);
  border-radius: 0.6rem;
  background: transparent;
  color: var(--ui-text-dimmed);
  font-size: 0.875rem;
  cursor: text;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.atrium-composer__cta:hover {
  background: color-mix(in srgb, var(--ui-primary) 5%, transparent);
  border-color: color-mix(in srgb, var(--ui-primary) 40%, var(--ui-border));
  color: var(--ui-text);
}
.atrium-composer__editor-wrap {
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--ui-primary) 30%, var(--ui-border));
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--ui-primary) 3%, var(--ui-bg));
  /* overflow:visible so the slash menu + @-mention popup can escape the
     composer's rounded frame (Floating UI mounts them as DOM children). */
  overflow: visible;
}
.atrium-composer__head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-primary) 18%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-primary) 6%, transparent);
}
.atrium-composer__editor-wrap :deep(.atrium-post-editor) {
  padding: 0.6rem 0.95rem;
  min-height: 4rem;
}
.atrium-composer__foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border-top: 1px solid color-mix(in srgb, var(--ui-primary) 18%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-primary) 4%, transparent);
}
/* On mobile, an active reply draft takes over the bottom of the viewport
   so the keyboard + editor + send button stay reachable. The CTA above
   the draft state remains a normal inline button. */
.atrium-composer--mobile {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  background: var(--ui-bg);
  border-top: 1px solid color-mix(in srgb, var(--ui-primary) 30%, var(--ui-border));
  padding: 0.55rem 0.6rem max(0.6rem, env(safe-area-inset-bottom));
  box-shadow: 0 -8px 22px -10px color-mix(in srgb, black 18%, transparent);
}
.atrium-composer--mobile .atrium-composer__editor-wrap {
  max-height: 60vh;
}
</style>
