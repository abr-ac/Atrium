/**
 * Atrium demo-seed runner.
 *
 * Boots once per Nitro process, after the service-role provider has
 * authenticated. Walks the root Y.Doc's `doc-tree` Y.Map and reconciles:
 *   - 1 forum space (type: 'forum') under the server root
 *   - 2 categories (type: 'category') under the forum
 *   - 6 boards (type: 'board') split 3 + 3 under the categories
 *   - 12 threads (type: 'thread') seeded across the boards
 *   - 2-3 replies (untyped) per thread
 *
 * Idempotent: all IDs are deterministic FNV1a-hashed UUIDs so repeated
 * boots (or multiple replicas) converge to the same set via Y.Map LWW.
 *
 * Set `ATRIUM_AUTOSEED=false` in the env to skip.
 */
import type { ServerRunnerDefinition } from "@abraca/nuxt";

const SERVER_ROOT_ID = "00000000-0000-0000-0000-000000000000";
const FORUM_TAG = "atrium:forum-demo";

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function detUuid(namespace: string, key: string): string {
  const a = fnv1a(`${namespace}:${key}:a`).toString(16).padStart(8, "0");
  const b = fnv1a(`${namespace}:${key}:b`).toString(16).padStart(8, "0");
  const c = fnv1a(`${namespace}:${key}:c`).toString(16).padStart(8, "0");
  return `${a}-${b.slice(0, 4)}-${b.slice(4, 8)}-${c.slice(0, 4)}-${c.slice(4, 12).padEnd(12, "0")}`;
}

interface BoardSpec {
  key: string;
  label: string;
  icon: string;
  subtitle: string;
  threads: ThreadSpec[];
}

interface ThreadSpec {
  key: string;
  label: string;
  subtitle: string;
  tags?: string[];
  priority?: 0 | 1 | 2 | 3 | 4;
  status?: string;
  replies: string[]; // each = first-line excerpt; stored as reply.label for Phase 1
}

interface CategorySpec {
  key: string;
  label: string;
  icon: string;
  subtitle: string;
  boards: BoardSpec[];
}

const FORUM_LABEL = "Atrium Demo Forum";
const FORUM_KEY = "forum-demo";

const CATEGORIES: CategorySpec[] = [
  {
    key: "cat-general",
    label: "General",
    icon: "users",
    subtitle: "Community-wide conversations",
    boards: [
      {
        key: "board-introductions",
        label: "Introductions",
        icon: "hand",
        subtitle: "Say hello — tell us who you are",
        threads: [
          {
            key: "t-hello-world",
            label: "Hello world! Newbie here from Berlin",
            subtitle: "Excited to join — coming from a Discord background, curious about CRDT-backed forums.",
            tags: ["intro", "new"],
            replies: [
              "Welcome! What kind of projects are you working on?",
              "👋 Hi from Munich!",
              "Welcome to Atrium. Pro tip: check the Engineering category if you like deep technical chats.",
            ],
          },
          {
            key: "t-long-time-lurker",
            label: "Long-time lurker, first-time poster",
            subtitle: "Been reading the threads for weeks, finally have something to contribute.",
            tags: ["intro"],
            replies: [
              "The best kind of welcome — glad you finally jumped in.",
              "Ditto. The Engineering board has been a goldmine for me.",
            ],
          },
        ],
      },
      {
        key: "board-off-topic",
        label: "Off-topic",
        icon: "coffee",
        subtitle: "Everything that isn't on-topic",
        threads: [
          {
            key: "t-coffee-vs-tea",
            label: "Coffee vs Tea — the endless debate",
            subtitle: "Don't @ me, espresso wins.",
            tags: ["debate", "fun"],
            replies: [
              "Tea. Calmer, more sustainable, more nuanced flavor.",
              "Cold brew is the correct answer.",
              "Matcha for focus, espresso for execution.",
              "You're all wrong, the answer is yerba mate.",
            ],
          },
          {
            key: "t-keyboard-recs",
            label: "What's everyone's daily-driver keyboard?",
            subtitle: "Looking to upgrade from a stock Magic Keyboard.",
            tags: ["hardware"],
            replies: [
              "Keychron Q1 with Banana switches. No regrets.",
              "HHKB Pro 2. Layout takes a week to get used to, then nothing else feels right.",
              "Glove80 — split + concave. Wrist pain gone.",
            ],
          },
        ],
      },
      {
        key: "board-announcements",
        label: "Announcements",
        icon: "megaphone",
        subtitle: "Official posts from the team",
        threads: [
          {
            key: "t-welcome-to-atrium",
            label: "Welcome to Atrium — read this first",
            subtitle: "Quick tour of what's here, how it works, and the community ground rules.",
            tags: ["pinned", "important"],
            priority: 4,
            status: "pinned",
            replies: [
              "Pinned this. New folks: please skim before posting.",
            ],
          },
          {
            key: "t-roadmap-2026",
            label: "Roadmap for the rest of 2026",
            subtitle: "Where we're heading, what we're shipping, what we're not.",
            tags: ["roadmap", "important"],
            priority: 3,
            replies: [
              "Glad to see federation on the list — finally.",
              "Any timeline on the mobile clients?",
              "+1 for native search.",
            ],
          },
        ],
      },
    ],
  },
  {
    key: "cat-engineering",
    label: "Engineering",
    icon: "code-2",
    subtitle: "Technical discussion, debugging, architecture",
    boards: [
      {
        key: "board-frontend",
        label: "Frontend",
        icon: "monitor",
        subtitle: "UI, UX, framework wars, CSS nightmares",
        threads: [
          {
            key: "t-yjs-tiptap",
            label: "Anyone using Yjs + TipTap in production?",
            subtitle: "Looking for war stories before we commit.",
            tags: ["yjs", "tiptap", "collab"],
            replies: [
              "Yes, 18 months in production. Mostly smooth, the gotchas are around document lifecycle, not the CRDT itself.",
              "Worth it. Awareness for cursors/presence is the killer feature.",
              "Tip: dedupe Yjs with Vite optimizeDeps. We hit constructor-check failures otherwise.",
            ],
          },
          {
            key: "t-architecture-deepdive",
            label: "Deep dive: building a forum on a CRDT — 40 things I learned",
            subtitle: "Long write-up after 9 months running Atrium-class workloads. Replies tagged by section.",
            tags: ["longread", "architecture", "yjs", "war-story"],
            priority: 3,
            replies: [
              "1/ Document granularity is the single most consequential decision. Per-thread docs scale; per-forum docs collapse under their own update log within weeks.",
              "2/ The temptation is to make 'one big Y.Doc' for the whole forum. Don't. Update log grows linearly with every keystroke across every thread.",
              "3/ Per-thread docs let you lazy-load. Active threads stay hot; old ones snapshot to cold storage. Memory profile is a sine wave instead of a ramp.",
              "4/ But — per-thread docs mean cross-thread queries (search, recents, unreads) live OUTSIDE the CRDT. You need a secondary index. Pick early.",
              "5/ We chose SQLite for the index. Postgres if you need multi-writer. Don't try to do it inside the CRDT — you'll fight LWW semantics forever.",
              "6/ Awareness is criminally underused. It's not just for cursors. We use it for typing indicators, scroll position, voice presence, draft signals.",
              "7/ The TTL pattern matters: stale awareness from disconnected peers haunts you. Sweep client-side with a Date.now()-based filter.",
              "8/ Yjs awareness has no concept of 'ownership' for fields. Two peers writing the same field is last-write-wins by clientId. Plan around it.",
              "9/ Trickled WebRTC signaling over awareness works for small rooms (≤8 peers). Beyond that, get an SFU. Mesh becomes N² connections.",
              "10/ TURN: you will need it. STUN alone fails symmetric NAT. Budget for ~$20/mo of TURN traffic per 100 daily active users.",
              "11/ Y.Array.observe fires for each insert. If you push 100 items in one transact(), you get one observe event. Use it.",
              "12/ Y.Map deletion is final. There's no 'soft delete'. If you need recoverable trash, model it as a meta.deleted=true flag.",
              "13/ Schema migrations on a CRDT are HARD. You can't run a migration script in one place — old clients keep producing old shapes.",
              "14/ Our pattern: schema version stamps on every doc. Readers reconcile to the latest known shape at read time. Writers always write current.",
              "15/ Provider authentication: do it in the WebSocket handshake, not after. Late-auth flows leak unauthenticated awareness to peers.",
              "16/ JWT TTLs of 7 days are fine if you have device-session refresh. Without it, mid-edit token expiry is a UX disaster.",
              "17/ The single biggest perf win we got: dedupe prosemirror-* packages via vite.resolve.dedupe. Schema-mismatch errors disappeared.",
              "18/ When two peers edit the same paragraph offline and reconnect, you do NOT want to show a merge dialog. Let the CRDT win. It's the point.",
              "19/ But — if both peers replaced the entire paragraph, the merge will be ugly. UX hint: highlight the conflicted region briefly post-merge.",
              "20/ Undo/redo in a multi-user CRDT is non-trivial. y-prosemirror's UndoManager only undoes YOUR operations. Test against concurrent edits.",
              "21/ File attachments: never put them in the CRDT directly. Content-address the bytes, store the hash in the doc, fetch over HTTP.",
              "22/ Our content-addressing uses SHA-256. Sufficient for collision avoidance at this scale; deduplicates uploads automatically.",
              "23/ Avatars: derive deterministically from the public key. No DB lookup, no upload pipeline, no GDPR question. Best decision we made.",
              "24/ Push notifications: don't try to derive them from CRDT update events. The signal-to-noise ratio is terrible. Use an explicit notify channel.",
              "25/ Search is the hardest read-side problem. We tokenize on write into a SQLite FTS5 table. Indexing on the server keeps clients fast.",
              "26/ Pagination of 'recent threads' lists: maintain a separate sort-key Y.Array. Otherwise you scan every thread's metadata on every load.",
              "27/ Rate-limiting on the CRDT layer is impossible (it's just deltas). Rate-limit at the WebSocket layer per-connection.",
              "28/ Permissions: bake them into the wire protocol, not the application. Server-side capability filtering before deltas hit peers.",
              "29/ The Hocuspocus protocol gives you good primitives for this. Auth handshake, room-scoped permissions, message filters.",
              "30/ For a forum specifically: 5 roles is the sweet spot. Owner, Admin, Mod, Editor, Viewer. More than that is bureaucracy without payoff.",
              "31/ Soft-deletion of posts: mark, hide from default view, surface in mod tools. Hard-delete only on legal request.",
              "32/ Edit history: free with the CRDT. Y.Doc.transact stores a vector clock you can replay. No extra schema needed.",
              "33/ Surface 'edited 2m ago' UX. Users distrust silent edits. We hide it after 24h to reduce visual noise.",
              "34/ Reactions: store as child docs with type='reaction'. Filter them out of the reply list. Aggregate counts at read time, never write time.",
              "35/ Reaction abuse: cap per-user per-post at 1 of each emoji. Easy to enforce client-side, server validates.",
              "36/ Mentions (@user): broadcast as awareness AND write to a notifications inbox. Awareness wakes the user immediately; inbox catches stragglers.",
              "37/ The hardest UX problem: 'follow this thread' semantics. Email-style inbox? Discord-style mentions only? We picked the latter, simpler.",
              "38/ Mobile clients: don't try to ship the same Y.Doc client. Bandwidth is too expensive. Build a thin REST gateway for cold reads.",
              "39/ Operational tooling: ship a /metrics endpoint on day 1. You will be paged at 3am asking why latency spiked. Have the answer ready.",
              "40/ Final lesson: a CRDT-backed forum is not a database with extra steps. It's a peer-to-peer protocol with a server-shaped accelerator. Design accordingly.",
              "Bookmarking this. Will be sending to my team.",
              "#23 is real. The avatar-from-pubkey trick saved us a quarter of work.",
              "On #28 — would love to see a follow-up post specifically on the capability-filter wire format. That's where most projects mess this up.",
              "#13 is the one that bites everyone. We're 3 schema versions deep and the read-time reconcile layer is now ~400 lines.",
              "Counterpoint to #38: native mobile clients can run the same Y.Doc — see iOS Apertura. The 'too expensive' argument is from 2022.",
              "Saving #20 — undo-in-collab is a recurring footgun.",
              "Loving the depth. Anyone got a similar post-mortem on offline-first editing flows?",
              "+1 to #6. Awareness is one of those features you don't appreciate until you've shipped without it.",
              "How are you handling thread archiving in practice? Just a meta flag, or do you actually move the doc to cold storage?",
              "Meta flag for the first 6 months, then we move to a separate SQLite shard. Snapshot, freeze, archive.",
              "This thread should be pinned and required reading.",
            ],
          },
          {
            key: "t-nuxt-4-migration",
            label: "Nuxt 4 migration — what broke for you?",
            subtitle: "About to bite the bullet. What should I watch out for?",
            tags: ["nuxt"],
            replies: [
              "The new srcDir layout (app/) is the biggest mental shift, but it's a one-time pain.",
              "Auto-imports across nested composables got stricter — some of mine needed explicit paths.",
              "Pinia → Nuxt's built-in state was a non-event for us.",
            ],
          },
        ],
      },
      {
        key: "board-backend",
        label: "Backend",
        icon: "server",
        subtitle: "Servers, databases, protocols, distributed systems",
        threads: [
          {
            key: "t-sqlite-vs-postgres",
            label: "SQLite vs Postgres for a real-time collab server",
            subtitle: "Single-node SQLite or distributed Postgres? Trade-offs?",
            tags: ["db", "architecture"],
            replies: [
              "SQLite wins until you need multi-writer. Then Postgres' MVCC is non-negotiable.",
              "Litestream gives you most of the resilience without leaving SQLite.",
              "We run SQLite + WAL + read replicas via litefs. Works great up to 10k concurrent.",
            ],
          },
          {
            key: "t-rust-async",
            label: "Tokio task per document — actor pattern in practice",
            subtitle: "How are people scaling the document-per-task pattern past 100k docs?",
            tags: ["rust", "tokio"],
            priority: 2,
            replies: [
              "We lazy-load: spawn on first connect, idle-unload after 5min.",
              "Same here. Memory is the bottleneck, not CPU — keep doc state small.",
            ],
          },
        ],
      },
      {
        key: "board-devops",
        label: "DevOps",
        icon: "ship",
        subtitle: "Deploy, observe, alert, recover",
        threads: [
          {
            key: "t-dokploy-vs-coolify",
            label: "Dokploy vs Coolify — which would you pick today?",
            subtitle: "Moving off Heroku for a small team. Hosting our own.",
            tags: ["self-host"],
            replies: [
              "Dokploy. Less polish but the Docker-native workflow is closer to what you'd build by hand.",
              "Coolify if you want batteries-included. Dokploy if you want fewer surprises.",
            ],
          },
        ],
      },
    ],
  },
];

export const atriumSeedRunner: ServerRunnerDefinition = {
  name: "atrium:seed",

  async start(ctx) {
    const autoseed = process.env.ATRIUM_AUTOSEED;
    if (autoseed === "false" || autoseed === "0" || autoseed === "off") {
      console.log("[atrium:seed] ATRIUM_AUTOSEED disabled — skipping");
      return undefined;
    }

    const { rootDoc, rootProvider } = ctx;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Y.Map runtime
    const tree = rootDoc.getMap("doc-tree") as any;

    // ── Forum space ─────────────────────────────────────────────────────────
    const forumId = detUuid("atrium:forum", FORUM_KEY);
    if (!tree.get(forumId)) {
      const now = Date.now();
      tree.set(forumId, {
        label: FORUM_LABEL,
        parentId: SERVER_ROOT_ID,
        order: now,
        type: "forum",
        meta: {
          tags: [FORUM_TAG],
          icon: "message-square",
          color: "#d97706",
          subtitle: "A demo forum showing the Atrium architecture end-to-end.",
        },
        createdAt: now,
        updatedAt: now,
      });
      console.log(`[atrium:seed] created forum ${forumId}`);
    } else {
      console.log(`[atrium:seed] reusing forum ${forumId}`);
    }

    // ── Build the rest of the tree in one transaction ───────────────────────
    const insertedIds: string[] = [];
    rootDoc.transact(() => {
      for (const cat of CATEGORIES) {
        const catId = detUuid("atrium:cat", cat.key);
        if (!tree.get(catId)) {
          const now = Date.now();
          tree.set(catId, {
            label: cat.label,
            parentId: forumId,
            order: now + insertedIds.length,
            type: "category",
            meta: { icon: cat.icon, subtitle: cat.subtitle },
            createdAt: now,
            updatedAt: now,
          });
          insertedIds.push(catId);
        }

        for (const board of cat.boards) {
          const boardId = detUuid("atrium:board", `${cat.key}/${board.key}`);
          if (!tree.get(boardId)) {
            const now = Date.now();
            tree.set(boardId, {
              label: board.label,
              parentId: catId,
              order: now + insertedIds.length,
              type: "board",
              meta: { icon: board.icon, subtitle: board.subtitle },
              createdAt: now,
              updatedAt: now,
            });
            insertedIds.push(boardId);
          }

          for (const thread of board.threads) {
            const threadId = detUuid(
              "atrium:thread",
              `${cat.key}/${board.key}/${thread.key}`,
            );
            if (!tree.get(threadId)) {
              const now = Date.now();
              tree.set(threadId, {
                label: thread.label,
                parentId: boardId,
                order: now + insertedIds.length,
                type: "thread",
                meta: {
                  subtitle: thread.subtitle,
                  ...(thread.tags ? { tags: thread.tags } : {}),
                  ...(thread.priority != null ? { priority: thread.priority } : {}),
                  ...(thread.status ? { status: thread.status } : {}),
                },
                createdAt: now,
                updatedAt: now + thread.replies.length, // newest reply timestamp
              });
              insertedIds.push(threadId);
            }

            for (let i = 0; i < thread.replies.length; i++) {
              const replyId = detUuid(
                "atrium:reply",
                `${cat.key}/${board.key}/${thread.key}/${i}`,
              );
              if (!tree.get(replyId)) {
                const now = Date.now();
                tree.set(replyId, {
                  label: thread.replies[i],
                  parentId: threadId,
                  order: now + insertedIds.length,
                  // Replies are untyped children of the thread — per the
                  // page-type-guidelines memory, never set `type` on
                  // descendants of a typed root.
                  meta: {},
                  createdAt: now,
                  updatedAt: now,
                });
                insertedIds.push(replyId);
              }
            }
          }
        }
      }
    });

    // ── Voice rooms ─────────────────────────────────────────────────────────
    // A demo voice channel under the forum so Phase 6 has somewhere to land.
    rootDoc.transact(() => {
      const voiceRooms = [
        {
          key: "lounge",
          label: "Lounge",
          icon: "headphones",
          subtitle: "Drop in, hang out.",
        },
        {
          key: "standup",
          label: "Daily Standup",
          icon: "users",
          subtitle: "15-minute sync, every morning.",
        },
      ];
      for (const r of voiceRooms) {
        const voiceId = detUuid("atrium:voice", `${FORUM_KEY}/${r.key}`);
        if (!tree.get(voiceId)) {
          const now = Date.now();
          tree.set(voiceId, {
            label: r.label,
            parentId: forumId,
            order: now + insertedIds.length,
            type: "voice-room",
            meta: { icon: r.icon, subtitle: r.subtitle },
            createdAt: now,
            updatedAt: now,
          });
          insertedIds.push(voiceId);
        }
      }
    });

    if (insertedIds.length > 0) {
      console.log(`[atrium:seed] inserted ${insertedIds.length} new tree entries`);
    } else {
      console.log("[atrium:seed] tree already populated, no changes");
    }

    // Force-materialise the forum doc so the server persists a row for it.
    // Without this the forum may not appear in `useSpaces()` until first client
    // visit — same gotcha the playground hits.
    try {
      await rootProvider.loadChild(forumId);
    } catch (e) {
      console.warn(
        `[atrium:seed] loadChild(${forumId}) failed:`,
        e instanceof Error ? e.message : e,
      );
    }

    return undefined;
  },
};
