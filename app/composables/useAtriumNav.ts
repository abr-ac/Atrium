// useAtriumNav — resolves the current route into a forum/category/board
// trail by walking the doc-tree. Used by the shell's mini rail + sidebar to
// highlight the active items and by main-pane breadcrumbs.

import type { TreeEntry } from "#imports";

const SERVER_ROOT_ID = "00000000-0000-0000-0000-000000000000";

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

  const allEntries = computed(() => tree.entries.value);

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

  // Tally helpers used by RightRail / sidebar unread dots.
  function threadsForBoard(boardId: string): TreeEntry[] {
    return allEntries.value.filter(
      (e) => e.type === "thread" && e.parentId === boardId,
    );
  }

  function repliesForThread(threadId: string): TreeEntry[] {
    return allEntries.value.filter(
      (e) => e.parentId === threadId && e.type !== "reaction",
    );
  }

  function reactionCountForPost(postId: string): number {
    return allEntries.value.filter(
      (e) => e.parentId === postId && e.type === "reaction",
    ).length;
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
    find,
    ancestors,
  };
}
