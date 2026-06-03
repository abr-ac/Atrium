// useAtriumProfile — per-user profile data backed by a Y.Map on rootDoc.
//
// Same shape as useAtriumReads: each user gets `atrium-profile:<pubkey>` as
// their own bucket. Cross-device sync happens for free via the rootDoc's
// CRDT sync. Reading another user's profile is a read of the same Y.Map by
// name — no permission gymnastics needed for the v0 layout.

export interface ProfileLink {
  label: string;
  url: string;
}

export interface ProfileState {
  bio: string;
  statusEmoji: string;
  statusText: string;
  links: ProfileLink[];
  updatedAt: number;
}

const KEYS = ["bio", "statusEmoji", "statusText", "links", "updatedAt"] as const;
type Key = (typeof KEYS)[number];

export function useAtriumProfile(pubkey: string | null) {
  const { doc } = useAbracadabra();
  // useSyncedMap requires a stable map name, so we fall back to an "anon"
  // bucket when the pubkey isn't known yet. Callers should only read meaningful
  // data once the pubkey resolves.
  const bucket = pubkey ? `atrium-profile:${pubkey}` : "atrium-profile:anon";
  const synced = useSyncedMap<unknown>(doc, bucket);

  const profile = computed<ProfileState>(() => {
    const data = synced.data as Record<string, unknown>;
    return {
      bio: typeof data.bio === "string" ? data.bio : "",
      statusEmoji: typeof data.statusEmoji === "string" ? data.statusEmoji : "",
      statusText: typeof data.statusText === "string" ? data.statusText : "",
      links: Array.isArray(data.links) ? (data.links as ProfileLink[]) : [],
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
    };
  });

  function update(patch: Partial<Omit<ProfileState, "updatedAt">>) {
    for (const k of Object.keys(patch) as Key[]) {
      const v = (patch as any)[k];
      if (v === undefined) continue;
      synced.set(k, v);
    }
    synced.set("updatedAt", Date.now());
  }

  function clear() {
    synced.clear();
  }

  return {
    profile,
    update,
    clear,
  };
}
