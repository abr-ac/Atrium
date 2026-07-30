// useAtriumNav — resolves the current route into a forum/category/board
// trail by walking the doc-tree. Used by the shell's mini rail + sidebar to
// highlight the active items and by main-pane breadcrumbs.

// `TreeEntry` is exported from the module's public entrypoint, NOT auto-imported
// into `#imports` — importing it from `#imports` fails to typecheck.
import type { TreeEntry } from "@abraca/nuxt";

const SERVER_ROOT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * A draft is a real child doc that exists from the moment the composer opens —
 * that's how autosave + /drafts work. It is NOT a post, so it must never reach
 * a public tally. Leaving it in is what made a thread's reply counter tick up
 * the instant someone clicked "Reply", before they'd typed a character.
 */
export function isPublished(entry: TreeEntry): boolean {
  return (entry.meta as Record<string, unknown> | undefined)?.draft !== true;
}

export interface NavTrail {
  forum: TreeEntry | null;
  category: TreeEntry | null;
  board: TreeEntry | null;
  thread: TreeEntry | null;
  voiceRoom: TreeEntry | null;
}

export function useAtriumNav() {
  const route = useRoute();
  const { doc } = useAbracadabra();
  // Subscribe to the whole doc-tree from the server root — yields every entry.
  const tree = useChildTree(doc, SERVER_ROOT_ID);

  /**
   * SSR seed for the tree.
   *
   * `tree.entries` is a live Y.Map and the CRDT only exists on the CLIENT, so it
   * is EMPTY during SSR. Every page derives its title, counts, tags and
   * breadcrumb from here, which is why the server used to render placeholders
   * ("Thread", "0 replies", no badges) that the client then replaced — one Vue
   * hydration mismatch (and an `Hydration completed but contains mismatches`
   * error) per navigation, and nothing useful for a crawler.
   *
   * `/api/_atrium/tree` serves the same tree out of the Nitro doc cache. Fetched
   * with `useAsyncData` so the payload is transferred to the client, meaning SSR
   * and the FIRST client render see identical data — which is what actually
   * makes hydration match. Once the live map syncs it takes over (below).
   */
  const { data: seed } = useAsyncData<{ entries: TreeEntry[] }>(
    "atrium:tree-seed",
    () => $fetch("/api/_atrium/tree"),
    { default: () => ({ entries: [] }), server: true },
  );

  // Live map wins the moment it has anything; the seed covers SSR + first paint.
  // (A merge would be wrong: an entry deleted after the snapshot was cached
  // would be resurrected forever.)
  const allEntries = computed<TreeEntry[]>(() =>
    tree.entries.value.length > 0 ? tree.entries.value : (seed.value?.entries ?? []),
  );

  function find(id: string | undefined): TreeEntry | null {
    if (!id) return null;
    return allEntries.value.find((e) => e.id === id) ?? null;
  }

  function ancestors(id: string | undefined): TreeEntry[] {
    const chain: TreeEntry[] = [];
    let cur = find(id);
    let safety = 0;
    while (cur && safety++ < 32) {
      chain.unshift(cur);
      cur = find(cur.parentId ?? undefined);
    }
    return chain;
  }

  const routeId = computed(() => {
    const id = route.params.id;
    return typeof id === "string" ? id : null;
  });

  const trail = computed<NavTrail>(() => {
    const r = routeId.value;
    const chain = ancestors(r ?? undefined);
    const trail: NavTrail = {
      forum: null,
      category: null,
      board: null,
      thread: null,
      voiceRoom: null,
    };
    for (const e of chain) {
      if (e.type === "forum") trail.forum = e;
      else if (e.type === "category") trail.category = e;
      else if (e.type === "board") trail.board = e;
      else if (e.type === "thread") trail.thread = e;
      else if (e.type === "voice-room") trail.voiceRoom = e;
    }
    return trail;
  });

  const forums = computed(() =>
    allEntries.value
      .filter((e) => e.type === "forum" && e.parentId === SERVER_ROOT_ID)
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  function categoriesForForum(forumId: string): TreeEntry[] {
    return allEntries.value
      .filter((e) => e.type === "category" && e.parentId === forumId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function boardsForCategory(categoryId: string): TreeEntry[] {
    return allEntries.value
      .filter((e) => e.type === "board" && e.parentId === categoryId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function voiceRoomsForForum(forumId: string): TreeEntry[] {
    return allEntries.value
      .filter((e) => e.type === "voice-room" && e.parentId === forumId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  // Tally helpers used by RightRail / sidebar counts / admin / the landing
  // stats. All of them are PUBLIC counts, so all of them drop drafts — see
  // isPublished() above. Surfaces that deliberately show the author their own
  // unpublished work (/drafts, the board list's own-draft row) filter on
  // `meta.draft` themselves rather than going through these.
  function threadsForBoard(boardId: string): TreeEntry[] {
    return allEntries.value.filter(
      (e) => e.type === "thread" && e.parentId === boardId && isPublished(e),
    );
  }

  function repliesForThread(threadId: string): TreeEntry[] {
    return allEntries.value.filter(
      (e) => e.parentId === threadId && e.type !== "reaction" && isPublished(e),
    );
  }

  function reactionCountForPost(postId: string): number {
    return allEntries.value.filter(
      (e) => e.parentId === postId && e.type === "reaction",
    ).length;
  }

  /** Every unpublished entry authored by `pubkey` — the /drafts feed. */
  function draftsForAuthor(pubkey: string): TreeEntry[] {
    if (!pubkey) return [];
    return allEntries.value.filter((e) => {
      const meta = e.meta as Record<string, unknown> | undefined;
      return meta?.draft === true && meta?.author === pubkey;
    });
  }

  return {
    SERVER_ROOT_ID,
    trail,
    forums,
    allEntries,
    categoriesForForum,
    boardsForCategory,
    voiceRoomsForForum,
    threadsForBoard,
    repliesForThread,
    reactionCountForPost,
    draftsForAuthor,
    isPublished,
    find,
    ancestors,
  };
}
