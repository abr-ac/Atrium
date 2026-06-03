// useAtriumBookmarks — per-device bookmarks (save-for-later), localStorage
// backed. Mirrors useAtriumReads in shape so R45's per-user-doc promotion can
// migrate both surfaces in one pass.
//
// API:
//   isBookmarked(id) -> boolean
//   bookmark(id, hint?)            — saves the entry (hint is a label + href cache)
//   unbookmark(id)
//   toggle(id, hint?)
//   all                            — array of saved bookmarks (most recent first)
//
// Server-backed sync is R45's job; v0 is per-device.

import { useLocalStorage } from "@vueuse/core";

const STORAGE_KEY = "atrium:bookmarks:v1";

export interface BookmarkRecord {
  id: string;
  savedAt: number;
  /** Cached label so the bookmarks page can render without the tree loaded. */
  label?: string;
  /** Cached href (`/t/<id>` or `/t/<thread>#<post>`) so the row still navigates. */
  href?: string;
  /** Optional thread label for context. */
  threadLabel?: string;
  /** Optional snippet preview. */
  snippet?: string;
}

let _store: ReturnType<typeof useLocalStorage<Record<string, BookmarkRecord>>> | null = null;

export function useAtriumBookmarks() {
  if (!_store) {
    _store = useLocalStorage<Record<string, BookmarkRecord>>(STORAGE_KEY, {}, {
      listenToStorageChanges: true,
    });
  }

  function isBookmarked(id: string): boolean {
    return !!_store!.value[id];
  }

  function bookmark(id: string, hint?: Omit<BookmarkRecord, "id" | "savedAt">) {
    const next = { ..._store!.value };
    next[id] = { id, savedAt: Date.now(), ...(hint ?? {}) };
    _store!.value = next;
  }

  function unbookmark(id: string) {
    if (!_store!.value[id]) return;
    const next = { ..._store!.value };
    delete next[id];
    _store!.value = next;
  }

  function toggle(id: string, hint?: Omit<BookmarkRecord, "id" | "savedAt">) {
    if (isBookmarked(id)) unbookmark(id);
    else bookmark(id, hint);
  }

  const all = computed<BookmarkRecord[]>(() =>
    Object.values(_store!.value).sort((a, b) => b.savedAt - a.savedAt),
  );

  const count = computed(() => all.value.length);

  return {
    store: _store!,
    isBookmarked,
    bookmark,
    unbookmark,
    toggle,
    all,
    count,
  };
}
