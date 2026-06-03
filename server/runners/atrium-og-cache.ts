/**
 * Atrium OG-card cache runner.
 *
 * Mirrors every thread's `{label, subtitle, forumLabel, replyCount}` into
 * Nitro storage under `atrium:og:<threadId>` so the `/api/og/[id].svg`
 * route can render a card synchronously without any Y.Doc access. The
 * runner re-publishes whenever the underlying tree entry mutates so cards
 * stay in sync with edited titles.
 */
import type { ServerRunnerDefinition } from "@abraca/nuxt";

interface OgMeta {
  label: string;
  subtitle: string;
  forumLabel: string | null;
  threadId: string;
  replyCount: number;
}

interface DocTreeEntry {
  parentId: string | null;
  label: string;
  type?: string;
  meta?: Record<string, unknown>;
}

function findForumAncestor(tree: any, startId: string): string | null {
  let cur = tree.get(startId) as DocTreeEntry | undefined;
  let safety = 0;
  while (cur && safety++ < 32) {
    if (cur.type === "forum") return cur.label ?? null;
    if (!cur.parentId) return null;
    cur = tree.get(cur.parentId) as DocTreeEntry | undefined;
  }
  return null;
}

function countReplies(tree: any, threadId: string): number {
  let count = 0;
  for (const [, v] of (tree as Map<string, DocTreeEntry>).entries()) {
    if (!v) continue;
    if (v.parentId === threadId && v.type !== "reaction") count += 1;
  }
  return count;
}

export const atriumOgCacheRunner: ServerRunnerDefinition = {
  name: "atrium:og-cache",

  async start(ctx) {
    const { rootDoc, storage } = ctx;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Y.Map runtime
    const tree = rootDoc.getMap("doc-tree") as any;

    async function publish(threadId: string) {
      const entry = tree.get(threadId) as DocTreeEntry | undefined;
      if (!entry || entry.type !== "thread") {
        await storage.removeItem(`atrium:og:${threadId}`);
        return;
      }
      const meta = (entry.meta ?? {}) as Record<string, unknown>;
      const payload: OgMeta = {
        label: entry.label ?? "Thread",
        subtitle: (meta.subtitle as string) ?? "",
        forumLabel: findForumAncestor(tree, threadId),
        threadId,
        replyCount: countReplies(tree, threadId),
      };
      await storage.setItem(`atrium:og:${threadId}`, payload);
    }

    // Initial pass — every existing thread.
    for (const [id, v] of (tree as Map<string, DocTreeEntry>).entries()) {
      if (v?.type === "thread") await publish(id);
    }
    console.log("[atrium:og-cache] primed");

    const observer = async (event: any) => {
      try {
        const dirty = new Set<string>();
        for (const [key, change] of event.changes.keys.entries()) {
          const id = key as string;
          if (change.action === "delete") {
            await storage.removeItem(`atrium:og:${id}`);
            continue;
          }
          const entry = tree.get(id) as DocTreeEntry | undefined;
          if (!entry) continue;
          if (entry.type === "thread") dirty.add(id);
          // Reply count changes when a child lands under a thread — touch
          // the parent thread.
          if (entry.parentId) {
            const parent = tree.get(entry.parentId) as DocTreeEntry | undefined;
            if (parent?.type === "thread") dirty.add(entry.parentId);
          }
        }
        for (const id of dirty) await publish(id);
      }
      catch (e) {
        console.error("[atrium:og-cache] observer failed:", e);
      }
    };
    tree.observe(observer);

    return () => {
      try { tree.unobserve(observer); }
      catch {}
    };
  },
};
