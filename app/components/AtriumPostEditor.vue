<script setup lang="ts">
// AtriumPostEditor — thin wrapper around the @abraca/nuxt <AEditor>, with
// Atrium-appropriate defaults for posts:
//   - prose variant (narrow measure, comfortable reading)
//   - no doc-tree drag handle (posts aren't list items)
//   - suggestion menu off in read-only mode
//
// docId references a tree entry whose Y.Doc holds the body Y.XmlFragment.
// AEditor handles loadChild/pin/unpin lifecycle internally.

const props = withDefaults(defineProps<{
  docId: string;
  editable?: boolean;
  placeholder?: string;
  /** Compact: tighter padding, slimmer toolbar — for the reply composer */
  compact?: boolean;
}>(), {
  editable: false,
  placeholder: "Share your thoughts… (⌘/Ctrl+Enter to post)",
  compact: false,
});

defineEmits<{
  ready: [];
}>();

const editorRef = ref<any>(null);

defineExpose({
  // Expose the underlying TipTap editor so parents can run commands
  // (insertImage, focus, getJSON, etc.).
  get editor() {
    return editorRef.value?.editor ?? null;
  },
});
</script>

<template>
  <div class="atrium-post-editor" :class="{ 'atrium-post-editor--compact': compact, 'atrium-post-editor--readonly': !editable }">
    <AEditor
      ref="editorRef"
      :doc-id="props.docId"
      :editable="props.editable"
      :placeholder="props.placeholder"
      :show-toolbar="props.editable"
      :show-suggestion-menu="props.editable"
      :show-drag-handle="false"
      variant="doc"
      @ready="$emit('ready')"
    />
  </div>
</template>

<style scoped>
.atrium-post-editor {
  width: 100%;
  font-size: 0.93rem;
  line-height: 1.55;
}
.atrium-post-editor :deep(.ProseMirror) {
  outline: none;
  min-height: 0;
  padding: 0;
}
.atrium-post-editor--compact :deep(.ProseMirror) {
  padding: 0.5rem 0;
}
.atrium-post-editor--readonly :deep(.ProseMirror) {
  cursor: default;
  padding: 0;
}
.atrium-post-editor--readonly :deep(.tiptap) {
  padding: 0;
  margin: 0;
}
.atrium-post-editor :deep(p) {
  margin: 0 0 0.6rem;
}
.atrium-post-editor :deep(p:last-child) {
  margin-bottom: 0;
}
.atrium-post-editor--readonly :deep(.ProseMirror p.is-empty:first-child::before) {
  content: "(no body yet)";
  color: var(--ui-text-dimmed);
  font-style: italic;
}

/* Compact (composer) mode — hide AEditor's built-in document title + meta
   chip area. Posts inherit identity from the thread's tree entry; the body
   editor is body-only. */
.atrium-post-editor--compact :deep(.ProseMirror) {
  padding: 0;
}
.atrium-post-editor--compact :deep(.document-header) {
  display: none;
}
.atrium-post-editor--compact :deep([data-type="document-meta"]) {
  display: none;
}
.atrium-post-editor--compact :deep(.ProseMirror p:first-child) {
  margin-top: 0;
}
.atrium-post-editor--compact :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: var(--ui-text-dimmed);
}

/* Read-only post bodies — also strip the document header & meta chip rail
   since posts use their parent thread entry's label / tags. */
.atrium-post-editor--readonly :deep(.document-header) {
  display: none;
}
.atrium-post-editor--readonly :deep([data-type="document-meta"]) {
  display: none;
}
</style>
