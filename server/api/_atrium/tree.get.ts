/**
 * GET /api/_atrium/tree  →  { entries: TreeEntrySnapshot[] }
 *
 * The whole forum `doc-tree`, read out of the SSR doc cache.
 *
 * ## Why
 *
 * Every Atrium page derives its content from `useChildTree(doc, SERVER_ROOT_ID)`
 * — a live Y.Map that is EMPTY during SSR (the CRDT only exists on the client).
 * So the server rendered placeholders — `<h1>Thread</h1>`, `"0 replies"`, no tag
 * badges, an empty breadcrumb — and the client replaced all of it on hydration,
 * producing a Vue mismatch warning per navigation:
 *
 *     Hydration text content mismatch on <h1>
 *       - rendered on server: Thread
 *       - expected on client: Deep dive: building a forum on a CRDT …
 *
 * plus `Hydration completed but contains mismatches` (an ERROR) on every route.
 * Beyond the noise it meant zero useful SSR content: crawlers and a cold first
 * paint both saw the placeholder.
 *
 * `atrium-doc-cache.ts` already keeps the root doc's `doc-tree` in the Nitro
 * cache, so the data is right there. This endpoint hands it to `useAtriumNav()`,
 * which seeds its entries from the snapshot when the live map is empty — giving
 * SSR and the first client render the SAME input, which is what makes hydration
 * match.
 *
 * Cached 30s swr: the tree changes on every post, and being a few seconds stale
 * in SSR is invisible (the client goes live on hydration).
 */
import { defineCachedEventHandler } from "nitropack/runtime";
// `getCachedJSON` is a @abraca/nuxt server auto-import (addServerImportsDir on
// runtime/server/utils) — no explicit import needed.

const SERVER_ROOT_ID = "00000000-0000-0000-0000-000000000000";

interface TreeEntrySnapshot {
  id: string;
  label: string;
  parentId: string | null;
  order: number;
  type?: string;
  meta?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
}

export default defineCachedEventHandler(async () => {
  const rootDocId = (useRuntimeConfig().public as {
    abracadabra?: { entryDocId?: string };
  }).abracadabra?.entryDocId ?? SERVER_ROOT_ID;

  const json = await getCachedJSON(rootDocId);
  const tree = (json?.["doc-tree"] ?? {}) as Record<string, Omit<TreeEntrySnapshot, "id">>;

  const entries: TreeEntrySnapshot[] = [];
  for (const [id, v] of Object.entries(tree)) {
    if (!v) continue;
    // Skip the root's own self-descriptor entry if one exists — it is not a
    // child, and listing it as one makes the root its own parent.
    if (id === rootDocId) continue;
    entries.push({
      id,
      label: v.label || "Untitled",
      parentId: v.parentId ?? null,
      order: v.order ?? 0,
      type: v.type,
      meta: v.meta,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    });
  }

  return { entries };
}, {
  maxAge: 30,
  swr: true,
  getKey: () => "atrium:tree",
});
