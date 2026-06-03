// useAtriumOnlinePeers — snapshot of currently-online peer pubkeys read
// from the provider's awareness map.
//
// Used by the @here mention flow: at publish time the composer captures
// the live online list and stamps it into `meta.notifyHere` so the server
// runner fans the @here notification to that exact set (instead of every
// author seen in the forum).
//
// Returns a function — not a reactive ref — because callers want a
// point-in-time snapshot, not a stream.

export function useAtriumOnlinePeers() {
  const abra = useAbracadabra();

  function snapshot(): string[] {
    const aw = (abra.provider.value as any)?.awareness;
    if (!aw) return [];
    const states = aw.getStates() as Map<number, any>;
    const set = new Set<string>();
    for (const state of states.values()) {
      const pk = state?.user?.publicKey as string | undefined;
      if (!pk || pk === "seed") continue;
      set.add(pk);
    }
    return [...set];
  }

  return { snapshot };
}
