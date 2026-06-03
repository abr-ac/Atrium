<script setup lang="ts">
// ModActions dropdown — Pin/Unpin, Lock/Unlock, Resolve, Delete. Operates by
// patching meta on the tree entry directly. No role gate yet — Phase 4 wires
// per-board permissions. Visible on thread headers and post action rows.

const props = defineProps<{
  entryId: string;
  tree: ReturnType<typeof useChildTree>;
  scope: "thread" | "reply";
}>();

const emit = defineEmits<{ edit: [id: string] }>();

const abra = useAbracadabra();

const entry = computed(() =>
  props.tree.entries.value.find((e) => e.id === props.entryId),
);

const isPinned = computed(() => {
  const meta = (entry.value?.meta ?? {}) as Record<string, unknown>;
  return (meta.priority as number) >= 4;
});

const isResolved = computed(() => {
  const meta = (entry.value?.meta ?? {}) as Record<string, unknown>;
  return (meta.status as string) === "resolved";
});

const isLocked = computed(() => {
  const meta = (entry.value?.meta ?? {}) as Record<string, unknown>;
  return Boolean(meta.locked);
});

function togglePin() {
  props.tree.updateMeta(props.entryId, {
    priority: isPinned.value ? 0 : 4,
  } as Record<string, unknown>);
}

function toggleResolved() {
  props.tree.updateMeta(props.entryId, {
    status: isResolved.value ? "open" : "resolved",
  } as Record<string, unknown>);
}

function toggleLock() {
  props.tree.updateMeta(props.entryId, {
    locked: !isLocked.value,
  } as Record<string, unknown>);
}

const confirmDeleteOpen = ref(false);

function requestDelete() {
  confirmDeleteOpen.value = true;
}

function confirmDelete() {
  confirmDeleteOpen.value = false;
  props.tree.deleteEntry(props.entryId);
}

const isAuthor = computed(() => {
  const author = (entry.value?.meta as any)?.author as string | undefined;
  return !!author && author === abra.publicKeyB64.value;
});

const items = computed(() => {
  const threadOnly = props.scope === "thread";
  const out: { label: string; icon: string; onSelect: () => void; color?: string }[] = [];
  if (threadOnly) {
    out.push({
      label: isPinned.value ? "Unpin thread" : "Pin to top",
      icon: isPinned.value ? "i-lucide-pin-off" : "i-lucide-pin",
      onSelect: togglePin,
    });
    out.push({
      label: isLocked.value ? "Unlock thread" : "Lock thread",
      icon: isLocked.value ? "i-lucide-unlock" : "i-lucide-lock",
      onSelect: toggleLock,
    });
    out.push({
      label: isResolved.value ? "Reopen" : "Mark resolved",
      icon: isResolved.value
        ? "i-lucide-rotate-ccw"
        : "i-lucide-check-circle-2",
      onSelect: toggleResolved,
    });
  }
  if (isAuthor.value) {
    out.push({
      label: "Edit",
      icon: "i-lucide-pencil",
      onSelect: () => emit("edit", props.entryId),
    });
  }
  out.push({
    label: "Delete",
    icon: "i-lucide-trash-2",
    onSelect: requestDelete,
    color: "error",
  });
  return [out];
});
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-more-horizontal"
      size="xs"
      :aria-label="'Moderation actions'"
    />
  </UDropdownMenu>

  <UModal v-model:open="confirmDeleteOpen" :ui="{ content: 'max-w-md' }">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-trash-2" class="size-5 text-error" />
        <p class="font-semibold">
          Delete {{ scope === "thread" ? "thread" : "reply" }}?
        </p>
      </div>
    </template>
    <template #body>
      <p class="text-sm">
        <strong class="font-medium">{{ entry?.label ?? "This item" }}</strong>
        will be removed. Descendants move to trash.
      </p>
      <p class="text-xs text-dimmed mt-2">
        Deletes propagate to every peer immediately via CRDT — undo is only
        possible if a peer still has the local update before garbage collection.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          @click="confirmDeleteOpen = false"
        >
          Cancel
        </UButton>
        <UButton
          color="error"
          icon="i-lucide-trash-2"
          @click="confirmDelete"
        >
          Delete
        </UButton>
      </div>
    </template>
  </UModal>
</template>
