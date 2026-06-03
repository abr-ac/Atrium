<script setup lang="ts">
// AtriumMentionPicker — modal peer picker. Triggered by typing "@" in a
// composer or pressing the Mention button. Lists every known author from
// the doc tree, filtered by a query that matches name or pubkey prefix.
// On select, emits the chosen peer so the parent can insert the mention.
//
// Modal (rather than floating popover) keeps focus management trivial and
// lets us reuse Nuxt UI's UModal / UCommandPalette stack.

const open = defineModel<boolean>("open", { default: false });
const props = withDefaults(defineProps<{
  initialQuery?: string;
}>(), { initialQuery: "" });

const emit = defineEmits<{
  select: [peer: { pubkey: string; name: string; color: string | null }];
}>();

const nav = useAtriumNav();
const abra = useAbracadabra();

const query = ref(props.initialQuery);
watch(open, (v) => {
  if (v) query.value = props.initialQuery;
});
watch(() => props.initialQuery, (v) => {
  if (open.value) query.value = v;
});

// Collect every author we've seen in the tree along with their most recent
// display name + color (latest entry wins).
const peers = computed(() => {
  const me = abra.publicKeyB64.value;
  const seen = new Map<string, { pubkey: string; name: string; color: string | null; lastSeen: number }>();
  for (const e of nav.allEntries.value) {
    const meta = (e.meta ?? {}) as Record<string, unknown>;
    const author = meta.author as string | undefined;
    if (!author || author === "seed" || author === me) continue;
    const name = (meta.authorName as string) ?? (meta.author_name as string) ?? author.slice(0, 8);
    const color = (meta.authorColor as string) ?? null;
    const ts = e.updatedAt ?? e.createdAt ?? 0;
    const prev = seen.get(author);
    if (!prev || prev.lastSeen < ts) {
      seen.set(author, { pubkey: author, name, color, lastSeen: ts });
    }
  }
  return [...seen.values()].sort((a, b) => b.lastSeen - a.lastSeen);
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return peers.value.slice(0, 30);
  return peers.value
    .filter((p) =>
      p.name.toLowerCase().includes(q)
      || p.pubkey.toLowerCase().startsWith(q),
    )
    .slice(0, 30);
});

const groups = computed(() => [
  {
    id: "peers",
    label: filtered.value.length ? "Recent peers" : "No matching peers",
    ignoreFilter: true,
    items: filtered.value.map((p) => ({
      id: p.pubkey,
      label: p.name,
      suffix: p.pubkey.slice(0, 10) + "…",
      icon: "i-lucide-at-sign",
      onSelect: () => {
        emit("select", { pubkey: p.pubkey, name: p.name, color: p.color });
        open.value = false;
      },
    })),
  },
]);
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{ content: 'max-w-xl w-full', overlay: 'backdrop-blur-sm' }"
    :transition="true"
  >
    <template #content>
      <UCommandPalette
        v-model:search-term="query"
        :groups="groups"
        :placeholder="'Mention someone…'"
        :ui="{
          input: 'h-12 text-base',
          itemLabelSuffix: 'text-dimmed text-xs',
        }"
      />
    </template>
  </UModal>
</template>
