<script setup lang="ts">
// AtriumPollComposer — modal for authoring a poll. On confirm, creates a
// `poll` tree entry under parentDocId (the host post draft) plus an option
// child per row, then emits the new pollId so the host can insert
// `![[pollId]]` into the body.

const props = defineProps<{
  open: boolean;
  /** The post (draft) the poll will be attached to. Poll entry becomes its child. */
  parentDocId: string | null;
}>();

const emit = defineEmits<{
  "update:open": [v: boolean];
  created: [pollId: string];
}>();

const { doc } = useAbracadabra();

const question = ref("");
const options = ref<string[]>(["", ""]);
const multi = ref(false);
const closes = ref<"never" | "1h" | "24h" | "7d">("never");
const anonymous = ref(false);

watch(
  () => props.open,
  (v) => {
    if (v) {
      question.value = "";
      options.value = ["", ""];
      multi.value = false;
      closes.value = "never";
      anonymous.value = false;
    }
  },
);

function addOption() {
  if (options.value.length >= 12) return;
  options.value.push("");
}

function removeOption(idx: number) {
  if (options.value.length <= 2) return;
  options.value.splice(idx, 1);
}

const validOptions = computed(() =>
  options.value.map((o) => o.trim()).filter((o) => o.length > 0),
);

const canCreate = computed(
  () =>
    !!props.parentDocId
    && question.value.trim().length > 0
    && validOptions.value.length >= 2,
);

function closesAtTs(): number | null {
  const now = Date.now();
  switch (closes.value) {
    case "1h": return now + 60 * 60 * 1000;
    case "24h": return now + 24 * 60 * 60 * 1000;
    case "7d": return now + 7 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function create() {
  const parent = props.parentDocId;
  if (!canCreate.value || !parent) return;
  // Wrap creation in a single Y transaction so peers see the poll +
  // every option appear atomically (and reactive renders don't flash a
  // half-built poll mid-write).
  const rootDoc = doc.value as any;
  let pollId = "";
  const make = () => {
    const tree = useChildTree(doc, parent);
    pollId = tree.createChild(parent, question.value.trim(), "poll");
    tree.updateMeta(pollId, {
      pollQuestion: question.value.trim(),
      pollMulti: multi.value,
      pollAnonymous: anonymous.value,
      ...(closesAtTs() ? { pollClosesAt: closesAtTs()! } : {}),
    } as Record<string, unknown>);
    for (const label of validOptions.value) {
      tree.createChild(pollId, label, "poll-option");
    }
  };
  if (rootDoc?.transact) rootDoc.transact(make);
  else make();
  if (pollId) emit("created", pollId);
  emit("update:open", false);
}

function cancel() {
  emit("update:open", false);
}

const closeOptions = [
  { label: "Never", value: "never" },
  { label: "In 1 hour", value: "1h" },
  { label: "In 24 hours", value: "24h" },
  { label: "In 7 days", value: "7d" },
];
</script>

<template>
  <UModal
    :open="props.open"
    :ui="{ content: 'max-w-lg' }"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-bar-chart-3" class="size-5 text-primary" />
        <p class="font-semibold">Create a poll</p>
      </div>
    </template>
    <template #body>
      <div class="flex flex-col gap-3">
        <UFormField label="Question" required>
          <UInput
            v-model="question"
            placeholder="What's the question?"
            autofocus
          />
        </UFormField>

        <UFormField label="Options" :hint="`${validOptions.length}/${options.length} filled`">
          <ul class="flex flex-col gap-2">
            <li
              v-for="(_, idx) in options"
              :key="idx"
              class="flex items-center gap-2"
            >
              <UInput
                v-model="options[idx]"
                :placeholder="`Option ${idx + 1}`"
                class="flex-1"
              />
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                size="sm"
                :disabled="options.length <= 2"
                aria-label="Remove option"
                @click="removeOption(idx)"
              />
            </li>
          </ul>
          <UButton
            class="mt-2"
            color="neutral"
            variant="ghost"
            icon="i-lucide-plus"
            size="sm"
            :disabled="options.length >= 12"
            @click="addOption"
          >
            Add option
          </UButton>
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Closes">
            <USelect v-model="closes" :items="closeOptions" />
          </UFormField>
          <div class="flex flex-col gap-2 justify-end pb-1">
            <UCheckbox v-model="multi" label="Allow multiple choices" />
            <UCheckbox v-model="anonymous" label="Anonymous voters" />
          </div>
        </div>

        <p v-if="!parentDocId" class="text-xs text-error">
          Start a draft first — a poll needs a post to attach to.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="cancel">
          Cancel
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-bar-chart-3"
          :disabled="!canCreate"
          @click="create"
        >
          Create poll
        </UButton>
      </div>
    </template>
  </UModal>
</template>
