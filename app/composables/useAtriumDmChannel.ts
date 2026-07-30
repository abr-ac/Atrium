// useAtriumDmChannel — resolve the backing document for a DM.
//
// A DM channel is a real `kind = "dm"` document at the server root (the old
// synthetic `dm:<a>:<b>` channel key is rejected by the server — see CLAUDE.md).
// Two halves:
//
//   * the id is DERIVED synchronously from the sorted pubkey pair, so reactive
//     state can be keyed immediately;
//   * the DOC must exist, with Editor rows for both participants, before the
//     first `messages:send` — otherwise the server answers
//     `not found: document <id> not found` and, because sends are
//     fire-and-forget, the message shows locally via the optimistic echo and is
//     then silently never persisted or delivered.
//
// ⚠️ We do NOT use the module's `ensureDmChannel()` / `client.findOrCreateDmDoc()`
// here. Those create the doc as the CALLING MEMBER, and a DM doc is top-level:
// Atrium's forum posture sets `[access].allow_user_top_level = false` (so members
// can't spawn forums), which makes a member's `POST /docs` fail with
// `403 forbidden: insufficient permissions`. Instead the privileged half runs on
// our own Nitro route as the service account, which re-derives the caller's
// identity from their bearer token — see
// `server/api/_atrium/dm/[pubkey].post.ts`.

/** Deterministic doc id for the pair — safe to call before the doc exists. */
export function dmDocIdFor(a: string, b: string): string {
  if (!a || !b) return "";
  return buildDmChannelId(a, b);
}

export function useAtriumDmChannel() {
  // The JWT lives on the CLIENT (`client.token`), not on the state object.
  const { publicKeyB64, client } = useAbracadabra();

  // One in-flight/settled promise per peer, so remounting the modal or the page
  // doesn't re-POST for a conversation already resolved this session.
  const ensured = new Map<string, Promise<string | null>>();

  async function ensure(otherPubkey: string): Promise<string | null> {
    const me = publicKeyB64.value;
    if (!me || !otherPubkey || me === otherPubkey) return null;

    const existing = ensured.get(otherPubkey);
    if (existing) return existing;

    const p = (async () => {
      try {
        const headers: Record<string, string> = {};
        const t = (client.value as { token?: string | null } | null)?.token;
        if (t) headers.Authorization = t.startsWith("Bearer ") ? t : `Bearer ${t}`;
        const res = await $fetch<{ docId: string }>(
          `/api/_atrium/dm/${encodeURIComponent(otherPubkey)}`,
          { method: "POST", headers },
        );
        return res?.docId ?? null;
      }
      catch (e) {
        // Leave it unresolved so a later attempt can retry rather than caching
        // the failure for the session.
        ensured.delete(otherPubkey);
        console.error("[atrium] could not open the DM document:", e);
        return null;
      }
    })();

    ensured.set(otherPubkey, p);
    return p;
  }

  return { ensure, dmDocIdFor };
}
