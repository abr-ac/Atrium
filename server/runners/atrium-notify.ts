/**
 * Atrium notifications runner.
 *
 * Watches the root `doc-tree` Y.Map and notifies the relevant people whenever
 * a reply/reaction lands under a post someone else wrote. Mentions
 * (`@<pubkey-prefix>`, `@here`, `@everyone`) resolve to their own notification.
 *
 * Idempotent: the in-process `seen` Set keeps each entry from notifying
 * twice within a single Nitro lifetime. On boot we prime it with every
 * entry currently in the tree so historical seed data doesn't blast a
 * thousand notifications into your inbox.
 *
 * ## ⚠️ Wire protocol — `messages:send`, NOT `notify:create`
 *
 * This runner used to send `notify:create` stateless frames. **That dialect no
 * longer exists.** abracadabra-rs unified `chat:*` + `notify:*` into a single
 * `messages:*` subsystem (`crates/abracadabra/src/messages.rs`: "Replaces the
 * old chat:* and notify:* dispatchers"), and `sendStateless` is fire-and-forget
 * — so every notification Atrium ever produced was silently discarded by the
 * server. Symptom: the runner logs "primed …" and then nothing, ever, while
 * /inbox says "You're all caught up."
 *
 * The supported path is `messages:send` on a channel doc with the recipients in
 * `mentions`. The server then writes an `InboxEntry` into each recipient's
 * `kind = "inbox"` doc (`fan_out_inboxes`), gated on that recipient actually
 * being able to READ the channel — so nobody can be force-fed an inbox entry
 * for a forum they can't see.
 *
 * Two things make this work for a runner:
 *   - the runner authenticates as a **service-role** account, and
 *     `messages:send` skips the channel role check for service callers
 *     (`if !ctx.is_service { … resolve … can_write() … }`), so it can post on
 *     any forum's behalf;
 *   - any doc the caller can write acts as a chat container — no `kind =
 *     "channel"` doc needed. We use the **forum** doc as the channel, so an
 *     inbox entry's `channel_doc_id` points at the forum the activity happened
 *     in, and the consent gate resolves against that forum's permissions.
 *
 * Cross-check `ABRA_MESSAGES_FAN_OUT_ALL_MEMBERS`: when true the server ALSO
 * fans out to every user with an explicit permission row on the channel, on top
 * of our `mentions`. Atrium's compose sets it true, which is fine here (a forum
 * has no explicit rows) but would double-notify on a doc that does.
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

/**
 * Deep-link marker appended to a notification body.
 *
 * An `InboxEntry` has no `link` field — the server stores who/where/when plus an
 * opaque `preview`, and the only doc reference it carries is `channel_doc_id`
 * (the forum, for us). So the thread permalink rides at the END of the body
 * behind this marker, and `app/pages/inbox.vue` parses + strips it via
 * `parseNotifyLink()` in `app/utils/notifyLink.ts`.
 *
 * Keep the two sides in step — the marker is the whole contract.
 */
export const NOTIFY_LINK_MARKER = " ⟦link:";

function withLink(content: string, link: string | undefined): string {
  return link ? `${content}${NOTIFY_LINK_MARKER}${link}⟧` : content;
}

interface NotifyTarget {
  /** Doc the fan-out hangs off — Atrium always passes the forum doc. */
  channelDocId: string;
  recipients: string[];
  /** One line; becomes the inbox entry's `preview`. */
  content: string;
  /** In-app path the notification should open, e.g. `/t/<threadId>`. */
  link?: string;
}

/**
 * Deliver one notification batch via `messages:send` (see the header note).
 *
 * Recipients ride in `mentions`; the server resolves each one's read access to
 * `channelDocId` and writes their inbox entry. Deduped and empty-guarded so we
 * never emit a send with no recipients (which would still append a message to
 * the forum's chat log for nobody).
 */
function notify(
  provider: { sendStateless?: (raw: string) => void },
  target: NotifyTarget,
) {
  if (!provider.sendStateless) return;
  const mentions = [...new Set(target.recipients.filter(Boolean))];
  if (mentions.length === 0 || !target.channelDocId) return;
  provider.sendStateless(
    JSON.stringify({
      type: "messages:send",
      id: globalThis.crypto.randomUUID(),
      channel_doc_id: target.channelDocId,
      content: withLink(target.content, target.link),
      mentions,
      ts: Date.now(),
    }),
  );
}

/**
 * Everyone already participating in `threadId` — the thread's opener plus every
 * non-draft reply author beneath it.
 *
 * The runner used to notify ONLY `parent.meta.author`. For a top-level reply the
 * parent IS the thread, so a conversation between three people only ever pinged
 * the opener, and — because seeded threads carry `meta.author === "seed"`, which
 * is explicitly skipped — the demo forum could never produce a single
 * notification. Thread participants is what a forum actually means by "reply to
 * your post".
 */
function threadParticipants(tree: any, threadId: string): Set<string> {
  const out = new Set<string>();
  const add = (v: any) => {
    const a = v?.meta?.author as string | undefined;
    if (a && a !== "seed") out.add(a);
  };
  add(tree.get(threadId));
  // One pass over the tree, collecting the thread's transitive descendants.
  const inThread = new Set<string>([threadId]);
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const [id, v] of (tree as Map<string, any>).entries()) {
      if (inThread.has(id)) continue;
      if (v?.parentId && inThread.has(v.parentId)) {
        inThread.add(id);
        progressed = true;
        if (v.type !== "reaction" && v?.meta?.draft !== true) add(v);
      }
    }
  }
  return out;
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
          // BOTH `add` and `update` matter. Atrium's composers create the post
          // as a `meta.draft: true` entry the moment the composer opens (that's
          // how autosave + /drafts work) and PUBLISH it by clearing the flag —
          // which is an `update`, not an `add`. Watching only `add` while also
          // skipping drafts would suppress every notification there is.
          if (change.action !== "add" && change.action !== "update") continue;
          const id = key as string;
          if (seen.has(id)) continue;

          const entry = tree.get(id) as DocTreeEntry | undefined;
          if (!entry) continue;
          if (!entry.parentId) continue;

          const meta = (entry.meta ?? {}) as Record<string, unknown>;
          const author = meta.author as string | undefined;
          if (!author || author === "seed") continue;
          // Still a draft — do NOT mark it seen, so the publish `update` that
          // clears the flag gets its turn. Notifying now would ping the thread
          // the instant someone started typing.
          if (meta.draft === true) continue;

          // Published: claim it so later edits don't re-notify.
          seen.add(id);

          const parent = tree.get(entry.parentId) as DocTreeEntry | undefined;
          if (!parent) continue;
          const parentMeta = (parent.meta ?? {}) as Record<string, unknown>;
          const parentAuthor = parentMeta.author as string | undefined;

          const thread = findThreadAncestor(tree, id);
          if (!thread) continue;
          const threadLabel = thread.threadLabel;
          // The forum doc is the fan-out channel — see the header note.
          const forumId = forumIdFor(tree, id);
          if (!forumId) continue;

          // Reactions ping only the reacted-to post's author.
          if (entry.type === "reaction") {
            if (!parentAuthor || parentAuthor === "seed" || parentAuthor === author) continue;
            notify(rootProvider, {
              channelDocId: forumId,
              recipients: [parentAuthor],
              content: `Someone reacted to your post in ${threadLabel}`,
              link: `/t/${thread.threadId}`,
            });
            continue;
          }

          // Replies + mentions
          const body = (meta.body as string) ?? entry.label ?? "";
          const snippet = body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 140);

          const forumLabel = findForumAncestor(tree, id);

          // Everyone already in the conversation, minus the person who just
          // wrote. Notifying only `parentAuthor` meant a reply to a thread only
          // ever reached its opener — and never at all on seeded threads, whose
          // author is the skipped sentinel "seed".
          const participants = threadParticipants(tree, thread.threadId);
          participants.delete(author);
          if (participants.size > 0) {
            notify(rootProvider, {
              channelDocId: forumId,
              recipients: [...participants],
              content: `New reply in ${threadLabel}: ${snippet || "(empty reply)"}`,
              link: `/t/${thread.threadId}`,
            });
          }

          // Broad-mention scan. @everyone fan-outs to every author in the
          // containing forum. @here uses `meta.notifyHere` — a client-
          // captured snapshot of online pubkeys taken at publish time —
          // so we don't notify peers who weren't actually present.
          if (/@everyone\b/.test(snippet)) {
            const forumAuthors = collectForumAuthors(tree, forumId);
            forumAuthors.delete(author);
            notify(rootProvider, {
              channelDocId: forumId,
              recipients: [...forumAuthors],
              content: `@everyone in ${forumLabel ?? "this forum"}: ${snippet}`,
              link: `/t/${thread.threadId}`,
            });
          }

          if (/@here\b/.test(snippet)) {
            const explicit = Array.isArray((meta as any).notifyHere)
              ? ((meta as any).notifyHere as string[])
              : null;
            // Fallback: if the composer didn't stamp targets (older client),
            // degrade to forum-author fan-out so the mention isn't silent.
            const here = explicit ?? [...collectForumAuthors(tree, forumId)];
            notify(rootProvider, {
              channelDocId: forumId,
              recipients: here.filter((p) => p && p !== author),
              content: `@here in ${forumLabel ?? "this forum"}: ${snippet}`,
              link: `/t/${thread.threadId}`,
            });
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
          // Don't double-notify people the reply notification already reached.
          for (const p of participants) mentioned.delete(p);
          if (mentioned.size > 0) {
            notify(rootProvider, {
              channelDocId: forumId,
              recipients: [...mentioned],
              content: `You were mentioned in ${threadLabel}: ${snippet}`,
              link: `/t/${thread.threadId}`,
            });
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
