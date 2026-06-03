// useAtriumPermissions — read-side authority over who can do what in Atrium.
//
// Two layers:
//   1. Server role (from @abraca/nuxt's `effectiveRole`) — applies globally.
//      Owner/Admin always pass; Service is special-cased true.
//   2. Forum ownership (from `forum.meta.owner` pubkey) — the pubkey that
//      seeded the forum, if recorded. When set, that peer counts as an
//      effective forum admin alongside Owner/Admin server roles.
//
// All checks return computed booleans, so they react to login changes,
// role grants, or `meta.owner` updates.
//
// This is the canonical permission surface for the UI. The Nitro
// `atrium-revert` runner uses the same fields to filter writes server-side,
// so client gating + server enforcement agree.

import type { TreeEntry } from "#imports";

const ADMIN_ROLES = new Set(["Service", "Admin", "Owner"]);

export function useAtriumPermissions() {
  const abra = useAbracadabra();

  const role = computed(() => abra.effectiveRole.value ?? null);
  const myPubkey = computed(() => abra.publicKeyB64.value ?? "");

  /** Has at least one of Service/Admin/Owner — global elevated authority. */
  const isServerAdmin = computed(() => {
    const r = role.value;
    return r ? ADMIN_ROLES.has(r) : false;
  });

  /** Returns true when I can administer this specific forum.
   *
   *  Owners are identified by `meta.owner` (pubkey b64). If no owner has
   *  been claimed yet, the forum is "open" — any signed-in peer can admin
   *  and the first admin action can stamp ownership. This matches the
   *  seed-then-claim flow used by demo forums. */
  function canAdminForum(forum: TreeEntry | null | undefined): boolean {
    if (!forum) return false;
    if (isServerAdmin.value) return true;
    const ownerPk = (forum.meta as any)?.owner as string | undefined;
    if (!ownerPk) {
      // Unclaimed forum — anyone signed in can step up.
      return Boolean(myPubkey.value);
    }
    return ownerPk === myPubkey.value;
  }

  /** Returns true when I can edit a board (rename, lock, pin, delete). */
  function canModerateBoard(board: TreeEntry | null | undefined, forum: TreeEntry | null | undefined): boolean {
    if (!board) return false;
    if (isServerAdmin.value) return true;
    return canAdminForum(forum);
  }

  /** Returns true when I can edit / delete a specific post. Authors can
   *  always edit their own work; moderators can edit anyone's. */
  function canEditPost(post: TreeEntry | null | undefined, forum?: TreeEntry | null | undefined): boolean {
    if (!post) return false;
    const author = (post.meta as any)?.author as string | undefined;
    if (author && author === myPubkey.value) return true;
    if (isServerAdmin.value) return true;
    if (forum) return canAdminForum(forum);
    return false;
  }

  return {
    role,
    myPubkey,
    isServerAdmin,
    canAdminForum,
    canModerateBoard,
    canEditPost,
  };
}
