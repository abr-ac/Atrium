<script setup lang="ts">
// Cmd+K palette — Atrium-specific. Indexes the doc-tree into four grouped
// command lists (Forums / Categories / Boards / Threads) plus a slim
// "Quick actions" group with go-home and dark-mode toggle. Routes via
// NuxtLink-equivalent navigateTo() because UCommandPalette renders inside a
// modal where <NuxtLink> doesn't get the hover treatment.

import type { TreeEntry } from "#imports";

const open = defineModel<boolean>("open", { default: false });

const nav = useAtriumNav();
const colorMode = useColorMode();
const router = useRouter();

const search = ref("");

function go(path: string) {
  open.value = false;
  router.push(path);
}

function matches(e: TreeEntry, q: string): boolean {
  if (!q) return true;
  const hay = `${e.label} ${(e.meta as any)?.subtitle ?? ""} ${((e.meta as any)?.tags ?? []).join(" ")}`;
  return hay.toLowerCase().includes(q);
}

const groups = computed(() => {
  const q = search.value.toLowerCase().trim();
  const out: { id: string; label: string; items: any[]; ignoreFilter?: boolean }[] = [];

  const forums = nav.forums.value.filter((e) => matches(e, q));
  if (forums.length) {
    out.push({
      id: "forums",
      label: "Forums",
      ignoreFilter: true,
      items: forums.map((f) => ({
        id: f.id,
        label: f.label,
        icon: `i-lucide-${(f.meta as any)?.icon ?? "message-square"}`,
        suffix: (f.meta as any)?.subtitle ?? "",
        onSelect: () => go(`/f/${f.id}`),
      })),
    });
  }

  // Categories — only those that match the query (otherwise the palette gets noisy)
  if (q) {
    const cats: TreeEntry[] = [];
    for (const f of nav.forums.value) {
      for (const c of nav.categoriesForForum(f.id)) {
        if (matches(c, q)) cats.push(c);
      }
    }
    if (cats.length) {
      out.push({
        id: "categories",
        label: "Categories",
        ignoreFilter: true,
        items: cats.map((c) => ({
          id: c.id,
          label: c.label,
          icon: `i-lucide-${(c.meta as any)?.icon ?? "folder"}`,
          suffix: (c.meta as any)?.subtitle ?? "",
          onSelect: () => go(`/c/${c.id}`),
        })),
      });
    }
  }

  // Boards — show all when no query (great for quick jumping); filter when typing
  const boards: TreeEntry[] = [];
  for (const f of nav.forums.value) {
    for (const c of nav.categoriesForForum(f.id)) {
      for (const b of nav.boardsForCategory(c.id)) {
        if (matches(b, q)) boards.push(b);
      }
    }
  }
  if (boards.length) {
    out.push({
      id: "boards",
      label: "Boards",
      ignoreFilter: true,
      items: boards.slice(0, q ? 50 : 12).map((b) => ({
        id: b.id,
        label: `#${b.label}`,
        icon: `i-lucide-${(b.meta as any)?.icon ?? "message-square-text"}`,
        suffix: (b.meta as any)?.subtitle ?? "",
        onSelect: () => go(`/b/${b.id}`),
      })),
    });
  }

  // Threads — search-only (would flood the palette otherwise)
  if (q) {
    const threads: { thread: TreeEntry; board: TreeEntry }[] = [];
    for (const f of nav.forums.value) {
      for (const c of nav.categoriesForForum(f.id)) {
        for (const b of nav.boardsForCategory(c.id)) {
          for (const t of nav.threadsForBoard(b.id)) {
            if (matches(t, q)) threads.push({ thread: t, board: b });
          }
        }
      }
    }
    if (threads.length) {
      out.push({
        id: "threads",
        label: "Threads",
        ignoreFilter: true,
        items: threads.slice(0, 30).map(({ thread, board }) => {
          const meta = (thread.meta ?? {}) as Record<string, unknown>;
          const isPinned = ((meta.priority as number) ?? 0) >= 4;
          return {
            id: thread.id,
            label: thread.label,
            icon: isPinned
              ? "i-lucide-pin"
              : meta.status === "resolved"
                ? "i-lucide-check-circle-2"
                : "i-lucide-message-circle",
            suffix: `#${board.label}`,
            onSelect: () => go(`/t/${thread.id}`),
          };
        }),
      });
    }
  }

  // Full-text bridge — when the user has typed a query, always offer to
  // drill into the dedicated /search page. This is the escape hatch when
  // the palette's 30-thread cap clipped the result set.
  if (q) {
    out.push({
      id: "fulltext",
      label: "Full text",
      ignoreFilter: true,
      items: [
        {
          id: "search-everywhere",
          label: `Search everywhere for "${search.value.trim()}"`,
          icon: "i-lucide-search",
          suffix: "Open full search",
          kbds: ["enter"],
          onSelect: () => go(`/search?q=${encodeURIComponent(search.value.trim())}`),
        },
      ],
    });
  }

  // Quick actions — always shown unless filtered out
  const quick: any[] = [
    {
      id: "home",
      label: "Go home",
      icon: "i-lucide-house",
      suffix: "Welcome screen",
      onSelect: () => go("/"),
    },
    {
      id: "inbox",
      label: "Open inbox",
      icon: "i-lucide-inbox",
      suffix: "Mentions & replies",
      onSelect: () => go("/inbox"),
    },
    {
      id: "drafts",
      label: "Open drafts",
      icon: "i-lucide-file-pen",
      suffix: "Unfinished posts",
      onSelect: () => go("/drafts"),
    },
    {
      id: "search-page",
      label: "Open search page",
      icon: "i-lucide-search",
      suffix: "Full-text scan",
      onSelect: () => go(q ? `/search?q=${encodeURIComponent(search.value.trim())}` : "/search"),
    },
    {
      id: "settings",
      label: "Open settings",
      icon: "i-lucide-settings",
      suffix: "Preferences & devices",
      onSelect: () => go("/settings"),
    },
    {
      id: "color-mode",
      label: colorMode.value === "dark" ? "Switch to light mode" : "Switch to dark mode",
      icon: colorMode.value === "dark" ? "i-lucide-sun" : "i-lucide-moon",
      onSelect: () => {
        colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
        open.value = false;
      },
    },
  ].filter((a) => matches({ label: a.label, meta: {} } as any, q));
  if (quick.length) {
    out.push({ id: "quick", label: "Quick actions", ignoreFilter: true, items: quick });
  }

  return out;
});

watch(open, (v) => {
  if (!v) search.value = "";
});

defineShortcuts({
  escape: {
    handler: () => {
      if (open.value) open.value = false;
    },
    usingInput: true,
  },
});
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{ content: 'max-w-2xl w-full', overlay: 'backdrop-blur-sm' }"
    :transition="true"
  >
    <template #content>
      <UCommandPalette
        v-model:search-term="search"
        :groups="groups"
        :placeholder="'Search forums, boards, threads…'"
        :ui="{
          input: 'h-12 text-base',
          itemLabelSuffix: 'text-dimmed',
        }"
        class="atrium-cmdk"
      />
    </template>
  </UModal>
</template>

<style scoped>
.atrium-cmdk :deep([class*="content"]) {
  max-height: 60vh;
}
</style>
