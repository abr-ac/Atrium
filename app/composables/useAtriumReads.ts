// useAtriumReads — per-thread last-read timestamps, server-backed.
//
// Storage: a per-user Y.Map on the root doc, keyed `atrium-reads:<pubkey>`.
// Reading from the same map cross-device gives free unread-state sync via
// the rootDoc's normal CRDT sync — no separate doc, no ACL surgery, no
// per-user doc-creation race.
//
// Migration: on first run, copies entries from the legacy localStorage key
// `atrium:reads:v1` into the Y.Map (only when newer), then drops the local
// key. Subsequent sessions read directly from the Y.Map.
//
// API:
//   isUnread(threadId, lastActivity) -> boolean
//   markRead(threadId)               -> stamps Date.now()
//   lastReadAt(threadId)             -> number | 0
//   reads                            -> reactive Record<string, number>

const LEGACY_STORAGE = "atrium:reads:v1";
const MIGRATED_FLAG = "atrium:reads:migrated-v2";

export function useAtriumReads() {
  const { doc, publicKeyB64 } = useAbracadabra();

  // Stable map name per user. If we don't have a pubkey yet (guest before
  // identity) we use an "anon" bucket — those reads will not sync across
  // devices but the API still works.
  const mapName = publicKeyB64.value
    ? `atrium-reads:${publicKeyB64.value}`
    : "atrium-reads:anon";

  const synced = useSyncedMap<number>(doc, mapName);

  // Migration: fold legacy localStorage entries into the Y.Map once, then
  // drop the local key. Runs only on the client; guarded by a flag so we
  // don't re-migrate on every page nav.
  if (import.meta.client) {
    void migrateLegacy(synced);
  }

  function lastReadAt(threadId: string): number {
    const v = synced.data[threadId];
    return typeof v === "number" ? v : 0;
  }

  function isUnread(threadId: string, lastActivity: number): boolean {
    if (!lastActivity) return false;
    return lastActivity > lastReadAt(threadId);
  }

  function markRead(threadId: string) {
    synced.set(threadId, Date.now());
  }

  function clear(threadId?: string) {
    if (!threadId) {
      synced.clear();
      return;
    }
    synced.remove(threadId);
  }

  return {
    reads: synced.data as Readonly<Record<string, number>>,
    lastReadAt,
    isUnread,
    markRead,
    clear,
  };
}

async function migrateLegacy(synced: ReturnType<typeof useSyncedMap<number>>) {
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === "1") return;
    const legacy = localStorage.getItem(LEGACY_STORAGE);
    if (!legacy) {
      localStorage.setItem(MIGRATED_FLAG, "1");
      return;
    }
    const parsed = JSON.parse(legacy) as Record<string, number>;
    if (!parsed || typeof parsed !== "object") {
      localStorage.removeItem(LEGACY_STORAGE);
      localStorage.setItem(MIGRATED_FLAG, "1");
      return;
    }
    // Y.Map needs the rootDoc bound; wait a tick after mount.
    await nextTick();
    // Wait briefly for the rootDoc binding (yMap is null until init runs).
    for (let i = 0; i < 50 && !synced.yMap.value; i++) {
      await new Promise((r) => setTimeout(r, 40));
    }
    if (!synced.yMap.value) return; // bail — try again next session
    for (const [threadId, ts] of Object.entries(parsed)) {
      if (typeof ts !== "number" || !threadId) continue;
      const cur = synced.data[threadId];
      if (typeof cur !== "number" || cur < ts) {
        synced.set(threadId, ts);
      }
    }
    localStorage.removeItem(LEGACY_STORAGE);
    localStorage.setItem(MIGRATED_FLAG, "1");
  }
  catch {
    // Best-effort migration — don't fail the composable on parse errors.
  }
}

