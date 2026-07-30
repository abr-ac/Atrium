/**
 * atrium:doc-cache — fills the @abraca/nuxt SSR doc cache with providers that
 * actually sync against the current abracadabra-rs build.
 *
 * ## The bug this fixes
 *
 * Every entry in the SSR doc cache was EMPTY:
 *
 *   .data/abracadabra-cache/json/<anyDocId>   → {}
 *   .data/abracadabra-cache/html/<anyDocId>   → ""
 *   .data/abracadabra-cache/json/<rootDocId>  → absent entirely
 *
 * so `GET /api/_abracadabra/render/:docId` answered
 * `{ html: "", title: "", type: "doc", meta: {} }` for every document, and every
 * Atrium route server-rendered a placeholder — `<h1>Thread</h1>`, `"0 replies"`,
 * `<title>Forum · Atrium</title>` — which the client then replaced with the real
 * CRDT data on hydration. Result: a Vue hydration-mismatch storm on EVERY
 * navigation ("Hydration text content mismatch … rendered on server: Thread,
 * expected on client: Hello world! Newbie here from Berlin"), zero useful SSR
 * content, and nothing for a crawler to read.
 *
 * Cause: the module's built-in `doc-tree-cache` runner loads child docs via
 * `rootProvider.loadChild()` riding the shared Node websocketProvider, and those
 * subdoc connections never sync in Node against this server build — the Y.Doc
 * stays empty, so `renderDocToJSON` correctly serialises nothing. Standalone
 * per-doc providers (the @abraca/mcp shape: own `Y.Doc({ guid })` + own socket,
 * auth via the shared client) do sync, so this runner re-observes every tree doc
 * through one of those and lets the module's own `observeDoc` render the cache.
 *
 * Ported from janis-io's `janis-doc-cache.ts`, which hit and solved the same
 * thing. Drop it once the module's runner handles Node subdoc sync itself.
 *
 * ## ⚠️ Bounded connections — do NOT open one socket per doc
 *
 * A standalone provider is ONE WebSocket, and Atrium's demo tree alone is 100+
 * docs. Opening them in a burst trips the server's per-IP cap
 * (`server.max_ws_connections_per_ip`, **default 64**): sockets past the cap get
 * `429 ws connection cap exceeded for IP`, never sync, and their doc renders
 * empty — i.e. exactly the bug this runner exists to fix, reintroduced. Behind a
 * reverse proxy it is worse: every visitor collapses to the proxy's IP and shares
 * that cap, so the runner starves and the deploy server-renders blank bodies
 * while dev looks fine.
 *
 * So connection count is decoupled from doc count: render through a small pool
 * (`CONCURRENCY`) of SHORT-LIVED providers — open, sync, hand the doc to
 * `observeDoc` (which caches the render), then DESTROY the socket. The Y.Doc is
 * retained so the cached render survives; only the network is released. At most
 * `CONCURRENCY` sockets are ever open. A periodic sweep re-opens each doc briefly
 * to pick up edits.
 */
import * as Y from "yjs";
import { AbracadabraProvider } from "@abraca/dabra";
import { Node } from "@tiptap/core";
import type { ServerRunnerContext } from "@abraca/nuxt";

const SERVER_ROOT_ID = "00000000-0000-0000-0000-000000000000";

// Server-side schema stubs for the module's custom editor nodes. The cache
// renderer builds its schema from StarterKit + plugin serverExtensions; every
// doc body starts with documentHeader/documentMeta, and without these
// `Node.fromJSON` throws "Unknown node type" → cached HTML stays empty.
const DocumentHeaderStub = Node.create({
  name: "documentHeader",
  group: "block",
  content: "inline*",
  renderHTML: () => ["h1", 0],
});
const DocumentMetaStub = Node.create({
  name: "documentMeta",
  group: "block",
  atom: true,
  renderHTML: () => ["div", { "data-document-meta": "", "style": "display:none" }],
});
const CalloutStub = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  renderHTML: () => ["div", { class: "callout" }, 0],
});

/** Upper bound on docs rendered for SSR. Safe to raise — see CONCURRENCY. */
const MAX_DOCS = 400;
/**
 * Max provider WebSockets open AT ONCE. Kept well under the server's per-IP cap
 * (default 64) so the runner never trips `429`, even behind a proxy sharing one
 * IP across every client. THE knob that decouples connections from doc count.
 */
const CONCURRENCY = 6;
const SYNC_TIMEOUT_MS = 8000;
/**
 * Re-render tracked docs periodically so edits reach the SSR cache (short-lived
 * providers hold no live subscription). Cheap — bounded to CONCURRENCY sockets —
 * and the client goes live on hydration anyway, so this only governs
 * crawler/first-paint freshness.
 */
const REFRESH_INTERVAL_MS = 120_000;

/** Minimal promise pool — runs `fn`s at most `concurrency` at a time. */
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const pump = () => {
    while (active < concurrency && queue.length) {
      active++;
      const run = queue.shift()!;
      run();
    }
  };
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(resolve, reject).finally(() => {
          active--;
          pump();
        });
      });
      pump();
    });
  };
}

export default defineNitroPlugin((nitroApp) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- hook contributed by @abraca/nuxt's Nitro plugin
  (nitroApp.hooks as any).hook("abracadabra:before-runners", () => {
    registerServerPlugin({
      name: "atrium:doc-cache",
      serverExtensions: () => [DocumentHeaderStub, DocumentMetaStub, CalloutStub],
      serverRunners: [
        {
          name: "atrium:doc-cache",
          async start(ctx: ServerRunnerContext) {
            const { client, rootDoc, rootDocId } = ctx;
            const treeMap = rootDoc.getMap("doc-tree");

            // Cache the ROOT doc too. It is not a tree entry, so neither runner
            // tracks it — and its json is what carries `doc-tree`, the map the
            // render/resolve endpoints read every label, type and meta from. The
            // root rides the already-synced shared rootProvider, so this costs no
            // extra socket. Without it the cache has no tree at all and every
            // title comes back "".
            const rootId = rootDocId || SERVER_ROOT_ID;
            observeDoc(rootId, rootDoc);

            // docId → retained Y.Doc. Holding the doc keeps its cached render and
            // its observeDoc slot alive after the socket is dropped.
            const docs = new Map<string, Y.Doc>();
            const timers = new Set<ReturnType<typeof setTimeout>>();
            const limit = createLimiter(CONCURRENCY);

            /**
             * Open a short-lived provider on `ydoc`, wait for sync, take the cache
             * slot from the module runner's empty loadChild doc, then release the
             * socket. Always called through the limiter.
             */
            async function renderDoc(docId: string, ydoc: Y.Doc): Promise<void> {
              const provider = new AbracadabraProvider({
                name: docId,
                document: ydoc,
                client,
                disableOfflineStore: true,
                subdocLoading: "lazy",
              });
              try {
                if (!provider.isSynced) {
                  await new Promise<void>((resolve) => {
                    const done = () => {
                      provider.off("synced", done);
                      resolve();
                    };
                    const t = setTimeout(done, SYNC_TIMEOUT_MS);
                    timers.add(t);
                    provider.on("synced", () => {
                      clearTimeout(t);
                      timers.delete(t);
                      done();
                    });
                  });
                }
                // observeDoc is first-writer-wins, so drop the module runner's
                // empty claim before taking the slot.
                unobserveDoc(docId);
                observeDoc(docId, ydoc);
              }
              finally {
                // Release the WebSocket — the retained ydoc keeps the render.
                try {
                  provider.destroy();
                }
                catch { /* already gone */ }
              }
            }

            function track(docId: string): void {
              // Never load the root through a child provider: that opens a
              // SECOND, empty Y.Doc for the root whose render OVERWRITES the
              // root's cache slot — the one holding `doc-tree`. janis-io lost
              // every SSR title to exactly this clobber.
              if (docId === rootId) return;
              if (docs.has(docId) || docs.size >= MAX_DOCS) return;
              const entry = treeMap.get(docId) as { trashed?: boolean } | undefined;
              if (!entry || entry.trashed) return;
              const doc = new Y.Doc({ guid: docId });
              docs.set(docId, doc);
              void limit(() => renderDoc(docId, doc)).catch((e) => {
                docs.delete(docId);
                console.warn(`[atrium:doc-cache] failed to track ${docId}:`, e);
              });
            }

            function untrack(docId: string): void {
              if (!docs.delete(docId)) return;
              unobserveDoc(docId);
            }

            // Initial sweep — all enqueued; the limiter caps live sockets.
            treeMap.forEach((_v, docId) => track(docId));
            console.log(
              `[atrium:doc-cache] tracking ${docs.size} docs through ${CONCURRENCY} pooled sockets`,
            );

            const sweep = setInterval(() => {
              for (const [docId, ydoc] of docs) {
                void limit(() => renderDoc(docId, ydoc)).catch(() => {});
              }
            }, REFRESH_INTERVAL_MS);

            const observer = (event: { keysChanged: Set<string> }) => {
              event.keysChanged.forEach((docId) => {
                const entry = treeMap.get(docId) as { trashed?: boolean } | undefined;
                if (entry && !entry.trashed) track(docId);
                else untrack(docId);
              });
            };
            treeMap.observe(observer);

            return () => {
              clearInterval(sweep);
              treeMap.unobserve(observer);
              for (const t of timers) clearTimeout(t);
              for (const id of [...docs.keys()]) untrack(id);
            };
          },
        },
      ],
    });
  });
});
