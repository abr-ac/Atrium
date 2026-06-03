/**
 * Atrium notifications runner.
 *
 * Watches the root `doc-tree` Y.Map and fires `notify:create` stateless
 * messages whenever a reply/reaction lands under a post whose author is
 * someone *other* than the new entry's author. Mentions (`@<pubkey-prefix>`)
 * in the body resolve to their own notification.
 *
 * Idempotent: the in-process `seen` Set keeps each entry from notifying
 * twice within a single Nitro lifetime. On boot we prime it with every
 * entry currently in the tree so historical seed data doesn't blast a
 * thousand notifications into your inbox.
 */
import type { ServerRunnerDefinition } from "@abraca/nuxt";

const seen = new Set<string>();

interface DocTreeEntry {
  parentId: string | null;
  label: string;
  type?: string;
  meta?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
}

function notify(
  provider: { sendStateless?: (raw: string) => void },
  recipientPubkey: string,
  type: "mention" | "chat" | "system",
  title: string,
  body: string,
  link?: string,
  sourceId?: string,
) {
  if (!provider.sendStateless) return;
  provider.sendStateless(
    JSON.stringify({
      type: "notify:create",
      recipient_id: recipientPubkey,
      notification_type: type,
      title,
      body,
      link,
      source_id: sourceId,
    }),
  );
}

function findThreadAncestor(tree: any, entryId: string): {
  threadId: string;
  threadLabel: string;
} | null {
  let cur: any = tree.get(entryId);
  let curId = entryId;
  let safety = 0;
  while (cur && safety++ < 32) {
    if (cur.type === "thread") {
      return { threadId: curId, threadLabel: cur.label ?? "thread" };
    }
    if (!cur.parentId) return null;
    curId = cur.parentId;
    cur = tree.get(cur.parentId);
  }
  return null;
}

function findForumAncestor(tree: any, entryId: string): string | null {
  let cur: any = tree.get(entryId);
  let safety = 0;
  while (cur && safety++ < 32) {
    if (cur.type === "forum") return cur.label ?? null;
    if (!cur.parentId) return null;
    cur = tree.get(cur.parentId);
  }
  return null;
}

function forumIdFor(tree: any, entryId: string): string | null {
  let cur: any = tree.get(entryId);
  let curId = entryId;
  let safety = 0;
  while (cur && safety++ < 32) {
    if (cur.type === "forum") return curId;
    if (!cur.parentId) return null;
    curId = cur.parentId;
    cur = tree.get(cur.parentId);
  }
  return null;
}

function collectForumAuthors(tree: any, forumId: string): Set<string> {
  // Walk every tree entry; collect distinct meta.author pubkeys for entries
  // that descend from this forum. Worst case O(N) over the tree per scan,
  // which is fine for typical forum sizes.
  const inForum = new Set<string>([forumId]);
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const [id, v] of (tree as Map<string, any>).entries()) {
      if (inForum.has(id)) continue;
      if (v?.parentId && inForum.has(v.parentId)) {
        inForum.add(id);
        progressed = true;
      }
    }
  }
  const authors = new Set<string>();
  for (const id of inForum) {
    const e = tree.get(id);
    const a = e?.meta?.author as string | undefined;
    if (a && a !== "seed") authors.add(a);
  }
  return authors;
}

export const atriumNotifyRunner: ServerRunnerDefinition = {
  name: "atrium:notify",

  async start(ctx) {
    const off = process.env.ATRIUM_NOTIFY;
    if (off === "false" || off === "0") {
      console.log("[atrium:notify] disabled via env");
      return undefined;
    }

    const { rootDoc, rootProvider } = ctx;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Y.Map runtime
    const tree = rootDoc.getMap("doc-tree") as any;

    // Prime: every entry already in the tree is treated as "seen" so we
    // don't fire a flood for the seed data on first boot.
    for (const key of tree.keys()) seen.add(key as string);
    console.log(
      `[atrium:notify] primed with ${seen.size} existing entries; watching for new posts`,
    );

    const observer = (event: any) => {
      try {
        for (const [key, change] of event.changes.keys.entries()) {
          if (change.action !== "add") continue;
          const id = key as string;
          if (seen.has(id)) continue;
          seen.add(id);

          const entry = tree.get(id) as DocTreeEntry | undefined;
          if (!entry) continue;
          if (!entry.parentId) continue;

          const meta = (entry.meta ?? {}) as Record<string, unknown>;
          const author = meta.author as string | undefined;
          if (!author || author === "seed") continue;

          const parent = tree.get(entry.parentId) as DocTreeEntry | undefined;
          if (!parent) continue;
          const parentMeta = (parent.meta ?? {}) as Record<string, unknown>;
          const parentAuthor = parentMeta.author as string | undefined;
          if (!parentAuthor || parentAuthor === "seed") continue;
          if (parentAuthor === author) continue;

          const thread = findThreadAncestor(tree, id);
          const threadLink = thread ? `/t/${thread.threadId}` : undefined;
          const threadLabel = thread?.threadLabel ?? "a thread";

          // Reactions get a softer notification than replies.
          if (entry.type === "reaction") {
            notify(
              rootProvider,
              parentAuthor,
              "chat",
              `Someone reacted to your post`,
              `in ${threadLabel}`,
              threadLink,
              id,
            );
            continue;
          }

          // Replies + mentions
          const body = (meta.body as string) ?? entry.label ?? "";
          const snippet = body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 140);

          notify(
            rootProvider,
            parentAuthor,
            "chat",
            `New reply in ${threadLabel}`,
            snippet || "(empty reply)",
            threadLink,
            id,
          );

          // Broad-mention scan. @everyone fan-outs to every author in the
          // containing forum. @here uses `meta.notifyHere` — a client-
          // captured snapshot of online pubkeys taken at publish time —
          // so we don't notify peers who weren't actually present.
          const fid = forumIdFor(tree, id);
          const forumLabel = fid ? findForumAncestor(tree, id) : null;

          if (/@everyone\b/.test(snippet)) {
            const forumAuthors = fid ? collectForumAuthors(tree, fid) : new Set<string>();
            forumAuthors.delete(author);
            for (const recipient of forumAuthors) {
              notify(
                rootProvider,
                recipient,
                "mention",
                `@everyone in ${forumLabel ?? "this forum"}`,
                snippet,
                threadLink,
                id,
              );
            }
          }

          if (/@here\b/.test(snippet)) {
            const explicit = Array.isArray((meta as any).notifyHere)
              ? ((meta as any).notifyHere as string[])
              : null;
            // Fallback: if the composer didn't stamp targets (older client),
            // degrade to forum-author fan-out so the mention isn't silent.
            const here = explicit ?? (() => {
              const all = fid ? [...collectForumAuthors(tree, fid)] : [];
              return all.filter((p) => p !== author);
            })();
            for (const recipient of here) {
              if (!recipient || recipient === author) continue;
              notify(
                rootProvider,
                recipient,
                "mention",
                `@here in ${forumLabel ?? "this forum"}`,
                snippet,
                threadLink,
                id,
              );
            }
          }

          // @<pubkey-prefix> mention scan — match pubkey prefixes (≥6
          // chars) that aren't broad targets, and notify each matched
          // peer once.
          const mentionRe = /@([a-zA-Z0-9_-]{6,})/g;
          const mentioned = new Set<string>();
          let m: RegExpExecArray | null;
          while ((m = mentionRe.exec(snippet)) !== null) {
            const needle = m[1]!.toLowerCase();
            if (needle === "everyone" || needle === "here") continue;
            for (const [, e] of tree.entries()) {
              const a = (e?.meta?.author as string | undefined) ?? undefined;
              if (!a || a === "seed" || a === author) continue;
              if (a.toLowerCase().startsWith(needle)) {
                mentioned.add(a);
                break;
              }
            }
          }
          for (const recipient of mentioned) {
            if (recipient === parentAuthor) continue;
            notify(
              rootProvider,
              recipient,
              "mention",
              `You were mentioned in ${threadLabel}`,
              snippet,
              threadLink,
              id,
            );
          }
        }
      }
      catch (e) {
        console.error("[atrium:notify] observer failed:", e);
      }
    };
    tree.observe(observer);

    return () => {
      try { tree.unobserve(observer); }
      catch {}
    };
  },
};
