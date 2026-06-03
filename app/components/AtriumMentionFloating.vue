<script setup lang="ts">
// AtriumMentionFloating — caret-anchored mention picker.
//
// Watches the editor's transactions for an "@<query>" pattern adjacent to
// the cursor and renders a floating list of matching peers right under
// the caret. Enter / Tab commits the highlighted peer; Escape / outside-
// click closes; ArrowUp/Down move the selection.
//
// The popover is a fixed-position div (no modal/overlay), teleported to
// <body> so it escapes the composer's overflow:hidden chrome.
//
// Renders nothing when there's no active "@<query>" pattern.

const props = defineProps<{
  // The TipTap editor instance (from AEditor's defineExpose).
  editor: any | null;
}>();

const nav = useAtriumNav();
const abra = useAbracadabra();

// Trigger state — populated by `update()` on every transaction.
const open = ref(false);
const query = ref("");
const triggerFrom = ref(0); // doc position of the "@"
const triggerTo = ref(0);   // doc position after the query
const anchor = ref<{ left: number; top: number; bottom: number } | null>(null);
const selectedIdx = ref(0);

// Active peer list, recomputed when query changes.
const peers = computed(() => {
  const me = abra.publicKeyB64.value;
  const seen = new Map<string, { pubkey: string; name: string; lastSeen: number }>();
  for (const e of nav.allEntries.value) {
    const meta = (e.meta ?? {}) as Record<string, unknown>;
    const author = meta.author as string | undefined;
    if (!author || author === "seed" || author === me) continue;
    const name = (meta.authorName as string) ?? (meta.author_name as string) ?? author.slice(0, 8);
    const ts = e.updatedAt ?? e.createdAt ?? 0;
    const prev = seen.get(author);
    if (!prev || prev.lastSeen < ts) seen.set(author, { pubkey: author, name, lastSeen: ts });
  }
  return [...seen.values()].sort((a, b) => b.lastSeen - a.lastSeen);
});

// Special targets — `@everyone` notifies every author in the forum;
// `@here` notifies peers currently online (via awareness). They show up
// at the top of the suggestion list when the query matches their prefix.
interface BroadTarget {
  pubkey: string;
  name: string;
  lastSeen: number;
  broad: true;
  icon: string;
  hint: string;
}
const BROAD_TARGETS: BroadTarget[] = [
  { pubkey: "everyone", name: "everyone", lastSeen: Number.MAX_SAFE_INTEGER, broad: true, icon: "i-lucide-megaphone", hint: "Notify all forum members" },
  { pubkey: "here", name: "here", lastSeen: Number.MAX_SAFE_INTEGER - 1, broad: true, icon: "i-lucide-radio", hint: "Notify peers currently online" },
];

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const matchesBroad = BROAD_TARGETS.filter((t) =>
    !q || t.name.toLowerCase().startsWith(q),
  );
  const peerList = q
    ? peers.value.filter((p) =>
        p.name.toLowerCase().includes(q)
        || p.pubkey.toLowerCase().startsWith(q),
      )
    : peers.value;
  return [...matchesBroad, ...peerList].slice(0, 8);
});

watch(filtered, () => {
  selectedIdx.value = 0;
});

// Look at the doc text before the cursor; if it matches "@<word>" with no
// space inside the word, we're in mention-trigger mode.
function update() {
  const editor = props.editor;
  if (!editor || !editor.state) {
    open.value = false;
    return;
  }
  const { state, view } = editor;
  const { selection } = state;
  if (!selection.empty) {
    open.value = false;
    return;
  }
  const pos = selection.from;
  // Grab up to 80 chars before the cursor on the current text block.
  const before = state.doc.textBetween(Math.max(0, pos - 80), pos, "\n", "\0");
  const match = /(^|\s)@([A-Za-z0-9_-]*)$/.exec(before);
  if (!match) {
    open.value = false;
    return;
  }
  const atOffset = match.index + (match[1] ?? "").length; // position of "@" inside `before`
  const from = pos - (before.length - atOffset);
  const coords = view.coordsAtPos(from);
  anchor.value = { left: coords.left, top: coords.top, bottom: coords.bottom };
  triggerFrom.value = from;
  triggerTo.value = pos;
  query.value = match[2] ?? "";
  open.value = true;
}

// Hook into TipTap transactions. The editor prop may change (composer
// mounts editor async), so re-bind when it does.
let unbindFn: (() => void) | null = null;
function bind(editor: any | null) {
  if (unbindFn) {
    unbindFn();
    unbindFn = null;
  }
  if (!editor) return;
  const onTx = () => update();
  editor.on("transaction", onTx);
  editor.on("focus", onTx);
  editor.on("blur", () => { open.value = false; });
  unbindFn = () => {
    try {
      editor.off("transaction", onTx);
      editor.off("focus", onTx);
    }
    catch {}
  };
  // Initial pass in case the user mounted us with content already there.
  update();
}
watch(() => props.editor, (e) => bind(e), { immediate: true });
onUnmounted(() => { if (unbindFn) unbindFn(); });

function commit(peer: { pubkey: string; name: string; broad?: boolean }) {
  const editor = props.editor;
  if (!editor) return;
  // Broad targets keep their human-readable name; peers use their pubkey
  // prefix so the markdown renderer can match the author lookup.
  const slug = peer.broad ? peer.name : peer.pubkey.slice(0, 10);
  editor
    .chain()
    .focus()
    .insertContentAt({ from: triggerFrom.value, to: triggerTo.value }, `@${slug} `)
    .run();
  open.value = false;
}

function onKeydown(ev: KeyboardEvent) {
  if (!open.value) return;
  if (filtered.value.length === 0) {
    if (ev.key === "Escape") {
      open.value = false;
      ev.preventDefault();
    }
    return;
  }
  if (ev.key === "ArrowDown") {
    selectedIdx.value = (selectedIdx.value + 1) % filtered.value.length;
    ev.preventDefault();
  }
  else if (ev.key === "ArrowUp") {
    selectedIdx.value = (selectedIdx.value - 1 + filtered.value.length) % filtered.value.length;
    ev.preventDefault();
  }
  else if (ev.key === "Enter" || ev.key === "Tab") {
    const peer = filtered.value[selectedIdx.value];
    if (peer) {
      commit(peer);
      ev.preventDefault();
      ev.stopPropagation();
    }
  }
  else if (ev.key === "Escape") {
    open.value = false;
    ev.preventDefault();
  }
}

// We attach the keydown to the editor's DOM via capture phase so we win
// over TipTap's own handlers for Enter / Arrow keys.
let keyboardEl: HTMLElement | null = null;
watch(() => props.editor, (e) => {
  if (keyboardEl) {
    keyboardEl.removeEventListener("keydown", onKeydown, true);
    keyboardEl = null;
  }
  if (e?.view?.dom) {
    keyboardEl = e.view.dom as HTMLElement;
    keyboardEl.addEventListener("keydown", onKeydown, true);
  }
}, { immediate: true });
onUnmounted(() => {
  if (keyboardEl) keyboardEl.removeEventListener("keydown", onKeydown, true);
});

// Click-outside dismiss.
function onDocPointerDown(ev: PointerEvent) {
  if (!open.value) return;
  const el = document.getElementById("atrium-mention-floating");
  if (el && ev.target instanceof Node && el.contains(ev.target)) return;
  // Click inside editor doesn't close — let `update()` decide based on
  // selection.
  if (props.editor?.view?.dom?.contains(ev.target as Node)) return;
  open.value = false;
}
if (typeof window !== "undefined") {
  watch(open, (v) => {
    if (v) document.addEventListener("pointerdown", onDocPointerDown, true);
    else document.removeEventListener("pointerdown", onDocPointerDown, true);
  });
  onUnmounted(() => document.removeEventListener("pointerdown", onDocPointerDown, true));
}

const popoverStyle = computed(() => {
  if (!anchor.value) return { display: "none" };
  // Prefer below the line; if it would clip the viewport bottom, flip above.
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const fitsBelow = anchor.value.bottom + 320 < viewportH;
  return {
    left: `${anchor.value.left}px`,
    top: fitsBelow ? `${anchor.value.bottom + 4}px` : "auto",
    bottom: fitsBelow ? "auto" : `${viewportH - anchor.value.top + 4}px`,
  } as Record<string, string>;
});
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <div
        v-if="open && filtered.length"
        id="atrium-mention-floating"
        class="atrium-mention"
        :style="popoverStyle"
        role="listbox"
        :aria-label="'Mention a peer'"
      >
        <p class="atrium-mention__head">
          <UIcon name="i-lucide-at-sign" class="size-3 text-primary" />
          Mentioning…
        </p>
        <button
          v-for="(p, i) in filtered"
          :key="p.pubkey"
          type="button"
          role="option"
          :aria-selected="i === selectedIdx"
          class="atrium-mention__row"
          :class="{
            'atrium-mention__row--active': i === selectedIdx,
            'atrium-mention__row--broad': (p as any).broad,
          }"
          @mouseenter="selectedIdx = i"
          @mousedown.prevent="commit(p)"
        >
          <template v-if="(p as any).broad">
            <span class="atrium-mention__broad-icon">
              <UIcon :name="(p as any).icon" class="size-3.5" />
            </span>
            <span class="atrium-mention__name truncate">@{{ p.name }}</span>
            <span class="atrium-mention__hint truncate">{{ (p as any).hint }}</span>
          </template>
          <template v-else>
            <AtriumAvatar :name="p.name" :size="22" />
            <span class="atrium-mention__name truncate">{{ p.name }}</span>
            <code class="atrium-mention__pubkey truncate">{{ p.pubkey.slice(0, 10) }}…</code>
          </template>
        </button>
        <p class="atrium-mention__foot">
          <UKbd>↵</UKbd> insert · <UKbd>esc</UKbd> dismiss
        </p>
      </div>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.atrium-mention {
  position: fixed;
  z-index: 60;
  width: 280px;
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-md, 0.65rem);
  box-shadow:
    0 8px 24px -8px color-mix(in srgb, black 30%, transparent),
    0 2px 6px color-mix(in srgb, black 12%, transparent);
  padding: 0.3rem;
  gap: 0.1rem;
}
.atrium-mention__head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-text-dimmed);
  padding: 0.3rem 0.5rem 0.2rem;
  margin: 0;
}
.atrium-mention__row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.4rem 0.55rem;
  border: none;
  background: transparent;
  border-radius: var(--atrium-radius-sm, 0.4rem);
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
}
.atrium-mention__row--active {
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
  color: var(--ui-primary);
}
.atrium-mention__row--broad {
  font-weight: 600;
}
.atrium-mention__broad-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-primary) 18%, transparent);
  color: var(--ui-primary);
}
.atrium-mention__hint {
  font-size: 0.65rem;
  color: var(--ui-text-dimmed);
  flex: 1 1 auto;
  min-width: 0;
}
.atrium-mention__name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 500;
  min-width: 0;
}
.atrium-mention__pubkey {
  font-family: var(--font-mono, ui-monospace);
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
  max-width: 7rem;
}
.atrium-mention__foot {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.65rem;
  color: var(--ui-text-dimmed);
  padding: 0.35rem 0.55rem 0.2rem;
  margin: 0.15rem 0 0;
  border-top: 1px solid var(--ui-border);
  flex-wrap: wrap;
}
</style>
