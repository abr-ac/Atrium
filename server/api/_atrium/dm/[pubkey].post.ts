/**
 * POST /api/_atrium/dm/:pubkey  →  { docId }
 *
 * Find-or-create the DM document between the **calling member** and `:pubkey`,
 * performed by the service account.
 *
 * ## Why this route exists
 *
 * A DM is a `kind = "dm"` document at the **server root**, and Atrium's forum
 * posture sets `[access].allow_user_top_level = false` so that only admins and
 * the service runner create top-level docs (that's what stops members spawning
 * forums). `POST /docs` is gated on exactly that flag, so a member calling
 * `client.findOrCreateDmDoc()` gets:
 *
 *     403 forbidden: insufficient permissions
 *
 * and — because `messages:send` is fire-and-forget — the DM then appeared locally
 * via the optimistic echo and was silently never persisted or delivered. Raising
 * `allow_user_top_level` would fix DMs by also letting any member create
 * top-level forums, which is not a trade worth making. So the privileged half
 * moves here: the service account (root admin) creates the doc and grants both
 * participants Editor.
 *
 * ## Trust model
 *
 * The caller's identity is **re-derived from their own bearer token** via
 * `GET /users/me` on the backend — never taken from the request body or a
 * caller-supplied field. Without that, any member could ask the service account
 * (root admin) to mint a DM between two arbitrary strangers and grant itself
 * Editor on it. The route therefore:
 *
 *   1. requires an Authorization header and resolves it to a real pubkey;
 *   2. creates the doc deterministically from the sorted pubkey pair, so the id
 *      is not something the caller chooses;
 *   3. grants Editor to exactly those two pubkeys and nobody else.
 *
 * `public_access: "none"` keeps it out of the anonymous floor. Note the
 * documented caveat: with a server-wide `[access].authenticated >= viewer`, a
 * non-participant could still READ a DM through that floor — sealed DMs need
 * `authenticated = none`. Atrium runs `authenticated = editor`, so DMs here are
 * private-by-convention, not sealed.
 */
import { createError, defineEventHandler, getRouterParam, getHeader } from "h3";
import { getServiceClient } from "../../../utils/atriumService";

/** Base64url Ed25519 pubkey — 43 chars, no padding. */
const PUBKEY_RE = /^[A-Za-z0-9_-]{20,64}$/;

export default defineEventHandler(async (event) => {
  const otherPubkey = getRouterParam(event, "pubkey");
  if (!otherPubkey || !PUBKEY_RE.test(otherPubkey)) {
    throw createError({ statusCode: 400, message: "a valid pubkey is required" });
  }

  const service = getServiceClient();
  if (!service) {
    throw createError({
      statusCode: 503,
      message: "service client not ready — the Abracadabra service runner has not booted",
    });
  }

  // ── Who is calling? Ask the backend, don't trust the client ────────────────
  const authHeader = getHeader(event, "authorization");
  if (!authHeader) {
    throw createError({ statusCode: 401, message: "authorization header required" });
  }
  const baseUrl = (useRuntimeConfig().public as { abracadabraUrl?: string }).abracadabraUrl;
  if (!baseUrl) {
    throw createError({ statusCode: 500, message: "abracadabraUrl not configured" });
  }

  let mePubkey: string;
  try {
    const me = await $fetch<{ publicKey?: string }>(`${baseUrl}/users/me`, {
      headers: { Authorization: authHeader },
    });
    if (!me?.publicKey) {
      throw createError({ statusCode: 401, message: "caller has no public key" });
    }
    mePubkey = me.publicKey;
  }
  catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) throw e;
    throw createError({ statusCode: 401, message: "could not resolve the calling identity" });
  }

  if (mePubkey === otherPubkey) {
    throw createError({ statusCode: 400, message: "cannot open a DM with yourself" });
  }

  // ── Create as the service account ─────────────────────────────────────────
  // `findOrCreateDmDoc` derives the id from the sorted pubkey pair, so both
  // participants converge on the same doc and a concurrent create just 409s
  // (which the SDK swallows). But it derives the pair from the CALLER's own
  // `getMe()` — and our caller is the service account, not the member. So do
  // the same steps explicitly for the real pair.
  const { deriveDmDocId } = await import("@abraca/dabra");
  const docId = deriveDmDocId(mePubkey, otherPubkey);

  try {
    await service.createDoc({ id: docId, kind: "dm", public_access: "none" });
  }
  catch (e) {
    // 409 = a row for this id already exists. Two ways that happens:
    //   - the other participant (or an earlier call) created it properly, or
    //   - the WEBSOCKET auto-created it when the chat panel first opened, in
    //     which case `kind` and `public_access` are NULL.
    // The second case matters: the server branches on `kind = "dm"` for the DM
    // participation check and for tagging the inbox entry `kind: "dm"`, so a
    // NULL-kind row silently degrades DMs to generic-channel behaviour. Heal it
    // rather than assuming the 409 means "already correct".
    const status = (e as { status?: number, statusCode?: number }).status
      ?? (e as { statusCode?: number }).statusCode;
    if (status !== 409) {
      throw createError({
        statusCode: 502,
        message: `could not create the DM document: ${(e as Error).message}`,
      });
    }
    try {
      const existing = await service.getDoc(docId);
      if (existing?.kind !== "dm") {
        await service.updateDocumentMeta(docId, { kind: "dm" });
      }
      if (existing?.public_access !== "none") {
        await service.setDocumentAccess(docId, "none");
      }
    }
    catch (healErr) {
      // Non-fatal: permissions below are what actually gate access, and the
      // message path works without `kind`. Log so a stuck row is visible.
      console.warn(`[atrium:dm] could not normalise DM doc ${docId}:`, healErr);
    }
  }

  // Idempotent — the server upserts on (doc_id, user_id).
  await Promise.all([
    service.setPermission(docId, { user_id: mePubkey, role: "editor" }),
    service.setPermission(docId, { user_id: otherPubkey, role: "editor" }),
  ]);

  return { docId };
});
