// useAtriumTyping — broadcast "I'm typing in X" via local awareness and
// observe other peers' typing states. Writes a single `atrium` field on
// the awareness state with `{ typingIn: <threadId>, typingName: <name> }`.
// Peers are kept fresh by stamping `typingAt` (ms) and we treat anyone whose
// stamp is older than 6 seconds as idle/stopped.

const TYPING_TTL_MS = 6000;

export interface TypingPeer {
  clientId: number;
  name: string;
  color: string;
  threadId: string;
}

export function useAtriumTyping() {
  const abra = useAbracadabra();
  const { peers } = useAwarenessPeers();

  function setTypingIn(threadId: string | null) {
    const awareness = (abra.provider.value as any)?.awareness;
    if (!awareness) return;
    if (threadId) {
      awareness.setLocalStateField("atrium", {
        typingIn: threadId,
        typingName: abra.userName.value,
        typingAt: Date.now(),
      });
    }
    else {
      awareness.setLocalStateField("atrium", null);
    }
  }

  // Tick once per second so the "is typing…" pill auto-clears once a peer
  // stops within TTL.
  const now = ref(Date.now());
  if (import.meta.client) {
    const iv = setInterval(() => {
      now.value = Date.now();
    }, 1000);
    onScopeDispose(() => clearInterval(iv));
  }

  function typersIn(threadId: string) {
    return computed<TypingPeer[]>(() => {
      const cutoff = now.value - TYPING_TTL_MS;
      const out: TypingPeer[] = [];
      for (const p of peers.value) {
        const a = (p as any).atrium as { typingIn?: string; typingName?: string; typingAt?: number } | null | undefined;
        if (!a || a.typingIn !== threadId) continue;
        if ((a.typingAt ?? 0) < cutoff) continue;
        out.push({
          clientId: p.clientId,
          name: a.typingName ?? p.user?.name ?? "someone",
          color: p.user?.color ?? "#888",
          threadId,
        });
      }
      return out;
    });
  }

  return {
    setTypingIn,
    typersIn,
  };
}
