// useAtriumFollows — local-storage backed thread follow list. A followed
// thread shows up in the inbox under a "Following" filter and shows a filled
// heart in its header.
//
// Storage: a JSON array of thread IDs at `atrium:follows`. We keep the API
// minimal (toggle / isFollowing / list) so swapping to a CRDT-backed store
// later doesn't require consumer churn.

import { useLocalStorage } from "@vueuse/core";

const STORAGE_KEY = "atrium:follows";

let _follows: ReturnType<typeof useLocalStorage<string[]>> | null = null;

export function useAtriumFollows() {
  if (!_follows) {
    _follows = useLocalStorage<string[]>(STORAGE_KEY, [], {
      listenToStorageChanges: true,
    });
  }

  function isFollowing(threadId: string): boolean {
    return _follows!.value.includes(threadId);
  }

  function toggle(threadId: string) {
    const set = new Set(_follows!.value);
    if (set.has(threadId)) set.delete(threadId);
    else set.add(threadId);
    _follows!.value = [...set];
  }

  function follow(threadId: string) {
    if (!isFollowing(threadId)) toggle(threadId);
  }

  function unfollow(threadId: string) {
    if (isFollowing(threadId)) toggle(threadId);
  }

  return {
    follows: _follows!,
    isFollowing,
    toggle,
    follow,
    unfollow,
  };
}
