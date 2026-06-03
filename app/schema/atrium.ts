import { z } from "zod";
import {
  defineDocType,
  defineSchema,
  ref,
  ytext,
  ymap,
  UniversalMeta,
  Doc,
  Prose,
  Kanban,
  Outline,
  Table,
  Gallery,
  Checklist,
  Dashboard,
  Slides,
} from "@abraca/schema";

// ---------------------------------------------------------------------------
// Atrium page-type roots
// ---------------------------------------------------------------------------
//
// Each registered type is the *root* of a content surface in Atrium. Children
// are intentionally untyped (per page-type-guidelines: never set `type` on
// descendants) so a board can switch its render between "classic linear list"
// and "chat-style feed" without migration.
//
// Phase 0 keeps every schema's meta = UniversalMeta. Atrium-specific keys
// (atrReplyCount, atrLastReplyAt, atrAuthMode, …) are bolted on in Phase 2
// once the actual write sites exist.

export const Forum = defineDocType({
  name: "forum",
  version: 1,
  meta: UniversalMeta,
  // No body — a forum space is a directory of categories + lounges + inbox.
  // children left open (advisory only); Phase 5 adds ref('category') etc.
});

export const Category = defineDocType({
  name: "category",
  version: 1,
  meta: UniversalMeta,
});

export const Board = defineDocType({
  name: "board",
  version: 1,
  meta: UniversalMeta,
});

export const Thread = defineDocType({
  name: "thread",
  version: 1,
  meta: UniversalMeta,
  // The opening post lives in the thread's own body. Replies are untyped
  // child docs, each with their own ytext() body.
  body: ytext(),
});

export const Channel = defineDocType({
  name: "channel",
  version: 1,
  meta: UniversalMeta,
  // Channels back the Discord-style live-chat surface and use the existing
  // MessagesClient (MSG_STATELESS `messages:*` + period docs). The channel
  // doc itself has no body; messages aggregate on period children.
});

export const Profile = defineDocType({
  name: "profile",
  version: 1,
  meta: UniversalMeta,
});

export const Inbox = defineDocType({
  name: "inbox",
  version: 1,
  meta: UniversalMeta,
  // Server-only writer via fan-out (messages.rs). Entries are children, read
  // state is a sibling Y.Map. Atrium reads, never writes directly.
});

export const ReadState = defineDocType({
  name: "read-state",
  version: 1,
  meta: UniversalMeta,
  // Per-user shadow doc. body = ymap of threadId → lastReadAt (number).
  body: ymap({ entries: ytext() }),
});

// Poll — embedded inside a post body via `![[pollId]]`. The poll itself is
// the typed root; option + vote tree entries are untyped descendants with
// `type: "poll-option"` and `type: "poll-vote"` respectively. Votes carry
// `meta.author` and live under their option (parentId = optionId). This
// mirrors how reactions hang off a post — same write/delete primitives, no
// new server surface.
export const PollMeta = UniversalMeta.extend({
  pollQuestion: z.string().optional(),
  pollMulti: z.boolean().optional(),
  pollClosesAt: z.number().int().optional(),
  pollAnonymous: z.boolean().optional(),
});

export const Poll = defineDocType({
  name: "poll",
  version: 1,
  meta: PollMeta,
});

// ---------------------------------------------------------------------------
// Atrium schema registry
// ---------------------------------------------------------------------------
//
// Bundles every Atrium-specific root + every built-in renderer page type we
// expect to host inside a forum (mods running a kanban board for the queue,
// outline for rules, dashboards for stats, etc.). Per `schema-free-core` —
// unknown types still pass through unchecked, so this list isn't an allowlist.

export const atriumSchema = defineSchema({
  types: [
    Forum,
    Category,
    Board,
    Thread,
    Channel,
    Profile,
    Inbox,
    ReadState,
    Poll,
    // Built-in renderers a forum admin may attach inside the tree.
    Doc,
    Prose,
    Kanban,
    Outline,
    Table,
    Gallery,
    Checklist,
    Dashboard,
    Slides,
  ],
});
