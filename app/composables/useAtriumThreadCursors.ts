// useAtriumThreadCursors — read & write per-thread reading-cursor presence.
//
// Each peer broadcasts a single `atrium-thread-cursor` field:
//
//   { threadId, postId, fraction, ts }
//
// `fraction` is a normalized 0..1 position down the visible feed. `postId`
// is the topmost post they currently have in view (computed by the page
// via IntersectionObserver and passed back in via setCursor()).
//
// Peers reading a different thread (or no thread) are ignored. A 12-second
// TTL filters out stale entries from peers who closed the tab without an
// awareness "disconnected" signal.

const FIELD = "atrium-thread-cursor";
const TTL_MS = 12_000;

export interface ThreadCursor {
  clientId: number;
  name: string;
  color: string;
  publicKey?: string;
  postId: string | null;
  fraction: number;
  ts: number;
}

interface LocalCursor {
  threadId: string;
  postId: string | null;
  fraction: number;
  ts: number;
}

export function useAtriumThreadCursors(threadId: MaybeRefOrGetter<string>) {
  const abra = useAbracadabra();
  const { peers, currentUser } = useAwarenessPeers();

  function getAwareness(): any {
    return (abra.provider.value as any)?.awareness ?? null;
  }

  function writeLocal(state: LocalCursor | null) {
    const aw = getAwareness();
    if (!aw) return;
    aw.setLocalStateField(FIELD, state);
  }

  // Self isn't shown — only peers' positions are interesting to render.
  const cursors = computed<ThreadCursor[]>(() => {
    const id = toValue(threadId);
    const out: ThreadCursor[] = [];
    const cutoff = Date.now() - TTL_MS;
    for (const p of peers.value) {
      const c = (p as any)[FIELD] as LocalCursor | undefined;
      if (!c) continue;
      if (c.threadId !== id) continue;
      if (c.ts < cutoff) continue;
      out.push({
        clientId: p.clientId,
        name: p.user?.name ?? "someone",
        color: p.user?.color ?? "#888",
        publicKey: p.user?.publicKey,
        postId: c.postId,
        fraction: c.fraction,
        ts: c.ts,
      });
    }
    return out;
  });

  function setCursor(postId: string | null, fraction: number) {
    const id = toValue(threadId);
    if (!id) return;
    writeLocal({
      threadId: id,
      postId,
      fraction: Math.max(0, Math.min(1, fraction)),
      ts: Date.now(),
    });
  }

  function clearCursor() {
    writeLocal(null);
  }

  // Auto-clear on unmount so peers don't see stale ghosts.
  onScopeDispose(() => {
    clearCursor();
  });

  return {
    cursors,
    setCursor,
    clearCursor,
    currentUser,
  };
}
