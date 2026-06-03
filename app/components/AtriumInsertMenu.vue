<script setup lang="ts">
// AtriumInsertMenu — composer "+ Insert" dropdown that injects content
// straight into the editor. Each item runs an editor chain command.
//
// These shapes are deliberately plain TipTap content (HTML / nodes); the
// markdown renderer that backs read-only post bodies recognises them. No
// custom node types are introduced.

import type { DropdownMenuItem } from "@nuxt/ui";

const props = defineProps<{
  editor: any | null;
  /** The post (draft) the inserted block will be attached to. Required for poll. */
  parentDocId?: string | null;
}>();

const emit = defineEmits<{ inserted: [kind: string] }>();
const toast = useToast();

function insertHTML(html: string, kind: string) {
  const editor = props.editor;
  if (!editor) return;
  editor.chain().focus().insertContent(html).run();
  emit("inserted", kind);
}

const pollOpen = ref(false);

function openPoll() {
  pollOpen.value = true;
}

function onPollCreated(pollId: string) {
  // Polls attach as tree children of the post (not body inserts), so the
  // editor body stays untouched. Notify the author so they know it landed.
  emit("inserted", "poll");
  toast.add({
    title: "Poll attached",
    description: "It will appear under your post when published.",
    icon: "i-lucide-bar-chart-3",
  });
  void pollId;
}

function insertCodeBlock() {
  const editor = props.editor;
  if (!editor) return;
  editor.chain().focus().toggleCodeBlock?.().run?.()
    ?? editor.chain().focus().insertContent(`<pre><code>// code…</code></pre>`).run();
  emit("inserted", "code");
}

function insertQuote() {
  insertHTML(`<blockquote><p>Quoted text…</p></blockquote>`, "quote");
}

function insertDivider() {
  insertHTML(`<hr/>`, "divider");
}

function insertCallout() {
  insertHTML(
    `<blockquote><p><strong>💡 Heads up</strong> — something readers should notice.</p></blockquote>`,
    "callout",
  );
}

function insertTodo() {
  const editor = props.editor;
  if (!editor) return;
  // TipTap's task-list extension is bundled in the starter kit.
  if (editor.commands?.toggleTaskList) {
    editor.chain().focus().toggleTaskList().run();
    emit("inserted", "todo");
    return;
  }
  insertHTML(`<ul><li>☐ Task one</li><li>☐ Task two</li></ul>`, "todo");
}

function insertTable() {
  const editor = props.editor;
  if (!editor) return;
  if (editor.commands?.insertTable) {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    emit("inserted", "table");
    return;
  }
  insertHTML(
    `<table><thead><tr><th>Col 1</th><th>Col 2</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table>`,
    "table",
  );
}

const items = computed<DropdownMenuItem[][]>(() => [
  [
    { type: "label", label: "Atrium blocks" },
    {
      label: "Poll",
      icon: "i-lucide-bar-chart-3",
      kbds: ["/", "p"],
      disabled: !props.parentDocId,
      onSelect: openPoll,
    },
    {
      label: "Callout",
      icon: "i-lucide-megaphone",
      onSelect: insertCallout,
    },
    {
      label: "Quote",
      icon: "i-lucide-quote",
      onSelect: insertQuote,
    },
  ],
  [
    { type: "label", label: "Standard" },
    {
      label: "Code block",
      icon: "i-lucide-code-2",
      onSelect: insertCodeBlock,
    },
    {
      label: "Task list",
      icon: "i-lucide-list-checks",
      onSelect: insertTodo,
    },
    {
      label: "Table",
      icon: "i-lucide-table",
      onSelect: insertTable,
    },
    {
      label: "Divider",
      icon: "i-lucide-minus",
      onSelect: insertDivider,
    },
  ],
]);
</script>

<template>
  <UDropdownMenu :items="items" :ui="{ content: 'min-w-52' }">
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-lucide-plus-square"
      aria-label="Insert block"
      title="Insert block"
    />
  </UDropdownMenu>
  <AtriumPollComposer
    v-model:open="pollOpen"
    :parent-doc-id="props.parentDocId ?? null"
    @created="onPollCreated"
  />
</template>
