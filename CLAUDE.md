# CLAUDE.md — abracadabra-atrium

Guidance for Claude Code working in this repo. Read this first; it captures what
is NOT obvious from the code, and in particular the places where **the server
and SDK moved on after Atrium was written**.

## What this is

**Atrium** — a forum / community platform on Abracadabra. "Woltlab structure
meets Discord realtime": long-form threads with chat-grade immediacy. Nuxt 4 +
Nuxt UI v4, everything backed by live CRDT documents.

The whole forum is one doc tree under the server root:

```
server root (00000000-0000-0000-0000-000000000000)
└─ forum      (type: "forum")        → /f/:id      + /f/:id/admin
   ├─ category  (type: "category")   → /c/:id
   │  └─ board    (type: "board")    → /b/:id
   │     └─ thread  (type: "thread") → /t/:id
   │        ├─ reply    (type: "reply")     ← body lives in the child doc
   │        └─ reaction (type: "reaction")
   └─ voice-room (type: "voice-room") → /v/:id
```

Routes are keyed by **doc id**, not slug. Non-tree routes: `/`, `/inbox`,
`/dm`, `/dm/:pubkey`, `/drafts`, `/bookmarks`, `/search`, `/settings`,
`/u/:pubkey`, `/u/me`.

## ⚠️ Running it locally — TWO processes, in order

Atrium needs its **own** Abracadabra backend. It is NOT the coop.cou.sh server
and NOT arcana's dev server on :3001 (that one runs
`anonymous=none, authenticated=viewer`, so every write silently fails).

### 1. Backend — port 4401

Lives in **`.dev-server/`** (`config.toml` checked in, `db/` is local). The
server reads `config.toml` from its **current working directory**, so it MUST be
launched with cwd = `.dev-server`:

```bash
cd .dev-server && ../../abracadabra-rs/target/debug/abracadabra
```

- Binds `127.0.0.1:4401`, db at `.dev-server/db/atrium.db`.
- The access model **deliberately mirrors `docker-compose.yml`**:
  `anonymous = observer` (guests read), `authenticated = editor` (members post),
  `creator = owner`, `allow_user_top_level = false`. Only the *limits* (rate
  caps, connection caps, secrets, CORS) are dev-flavoured. A dev server that is
  kinder than the deploy is not a dev server.
- Declares two system users matching the compose: `owner`/`owner` (human admin)
  and `atrium-service` (the **RPC/service identity** the Nitro runners
  authenticate as, keyed to the DEV-ONLY keypair in `.env`).
- `GET /` returns 404 — normal, it's an API/WS server.
- Gotcha: the `[documents]` TOML key is **`auto_create`**, not
  `auto_create_documents`. The latter used to be ignored in silence and the
  default (false) stood — this repo found that independently, and it cost
  `jun-is` and `janis-io` a great deal more before it propagated. Server ≥ 3.1
  names any key that binds to nothing at boot (with a "did you mean", and
  migration text for renamed keys), and `[server].strict_config = true` makes
  it refuse to start instead.
- Don't `pkill -f abracadabra-atrium` — it matches the backend's `.dev-server`
  path and takes the backend down with the app.

### 2. Nuxt dev — port 3401

```bash
pnpm dev
```

- `.env` sets `ABRACADABRA_URL=http://localhost:4401` plus the service keypair.
- Healthy startup: `Authenticated as service role` → `Root doc synced` →
  `Starting runner: atrium:seed` → `atrium:doc-cache] tracking N docs` →
  `All runners started`.
- Backgrounding gotcha: a background-spawned Nuxt 4 dev needs a pty or it hits
  `ERR_TTY_INIT_FAILED` and restart-loops. Wrap it:
  `script -q /dev/null sh -c 'pnpm dev'`.
- `pnpm typecheck` needs `.nuxt/` to exist. If you delete it, run
  `npx nuxi prepare` first or `vue-tsc` walks `node_modules` and emits hundreds
  of unrelated errors.

### Seeding

`server/runners/atrium-seed.ts` builds a deterministic demo forum (1 forum, 2
categories, 6 boards, 12 threads, ~90 replies) on every boot. Idempotent —
FNV1a-hashed UUIDs converge via Y.Map LWW. `ATRIUM_AUTOSEED=false` to skip.

Seeded posts carry `meta.author === "seed"`, a sentinel that is **explicitly
skipped** by the notify runner and the member panel. Anything that only fires
for real authors will look dead against seed-only data.

---

## ⚠️ Protocol drift — what changed under Atrium (audited 2026-07-30)

Atrium's last feature commit is `75e15dd` (2026-07-12); everything after is
`wand` version bumps. The server and SDK moved in ways that broke it silently.
**Read this section before touching chat, notifications or DMs.**

### `notify:*` is GONE — notifications ride `messages:send`

abracadabra-rs collapsed the `chat:*` and `notify:*` stateless dialects into one
`messages:*` subsystem (`crates/abracadabra/src/messages.rs`: *"Replaces the old
chat:* and notify:* dispatchers"*). Nothing answers `notify:create`,
`notify:fetch` or `notify:mark_read` any more, and `sendStateless` is
fire-and-forget — so notifications were **silently discarded for months**. Tell:
`[atrium:notify] primed with N …` and then nothing, ever, while /inbox says
"You're all caught up."

The model now:

- A notification is an **`InboxEntry`** on the recipient's own `kind = "inbox"`
  doc, written **by the server** as a side effect of `messages:send` fan-out.
- Recipients come from the message's `mentions` array, **consent-gated**: the
  server drops a mention whose target can't READ the channel, so nobody can be
  force-fed an inbox entry (with a cleartext preview) for a forum they can't see.
- There is **no** "create an arbitrary notification for user X" API.
- Read side: `messages:inbox_fetch` → `messages:inbox_history`
  `{ inbox_doc_id, entries }`; `messages:inbox_mark_read` (`id`/`ids`/
  `source_id`/`all`).

`server/runners/atrium-notify.ts` posts `messages:send` on the **forum** doc with
the recipients in `mentions`. Two things make that legal for a runner: the
service role skips the channel role check on `messages:send`, and any writable
doc acts as a chat container (no `kind = "channel"` doc needed).

> **`InboxEntry` has no `link` field.** The thread permalink rides at the END of
> the message body behind a marker — `NOTIFY_LINK_MARKER` in
> `server/runners/atrium-notify.ts` and `app/utils/notifyLink.ts`. Those two
> constants ARE the contract; keep them identical. They can't share a module
> (one is Nitro server code, the other the client bundle).

### DM channels are REAL DOCS, not `dm:<a>:<b>` keys

A DM is a `kind = "dm"` document at the server root with explicit Editor rows for
both participants. The old synthetic channel key is rejected outright:

```
WARN abracadabra::messages: Messages: handler error for messages:send:
  not found: document dm:<a>:<b> not found
```

Nastily, the send is fire-and-forget: the message appears via the optimistic echo
and is then **never persisted or delivered**. Both halves are required:

- `buildDmChannelId(a, b)` — synchronous, deterministic (`deriveDmDocId`, a hash
  of the sorted pubkey pair). Use it to key reactive state.
- the backing doc must **exist**, with Editor rows for both participants, before
  the first send.

> **⚠️ A member CANNOT create the DM doc.** A DM doc is top-level, and Atrium's
> forum posture sets `[access].allow_user_top_level = false` (that's what stops
> members spawning forums). `POST /docs` is gated on exactly that flag, so the
> module's `ensureDmChannel()` / `client.findOrCreateDmDoc()` — which create as
> the calling member — return `403 forbidden: insufficient permissions`. Raising
> the flag would fix DMs by also letting any member create top-level forums,
> which is not a trade worth making.
>
> So the privileged half runs server-side: **`POST /api/_atrium/dm/:pubkey`**
> creates the doc as the **service account** and grants both participants Editor.
> It re-derives the caller's identity from their own bearer token via
> `GET /users/me` — never from a body param, or any member could ask a root-admin
> account to mint a DM between two strangers. `app/composables/useAtriumDmChannel.ts`
> is the client half; `AtriumDMModal` and `pages/dm/[pubkey].vue` call
> `ensure()` in a watcher.
>
> On a 409 the route also **heals** `kind`/`public_access`: the websocket
> auto-creates the doc with `kind = NULL` when the chat panel first opens, and the
> server branches on `kind = "dm"` for the participation check and for tagging the
> inbox entry `kind: "dm"`.

The service client reaches Nitro routes via `server/plugins/atrium-service-handle.ts`
→ `server/utils/atriumService.ts` (a runner stashes `ctx.client`; @abraca/nuxt
exports no accessor for it).

### Renamed / reshaped SDK surface

| Was | Now |
|---|---|
| `import type { TreeEntry } from "#imports"` | `from "@abraca/nuxt"` — it's exported, not auto-imported |
| `ChatMessage.timestamp` | `ChatMessage.createdAt` |
| `AbracadabraState.username` | gone; use `identityState === "claimed"` (`userName` is the *display name*, which every guest has) |
| `<AChatPanel>` `typingUsers: string[]` | `TypingUser[]` = `{ name, avatarStyle? }` |
| `<AChatPanel>` `mentionUsers: {id,label,color}[]` | `ChatMentionUser[]` = `{ id, name, isAgent? }` |
| `ymap({ key: … })` | `ymap(valueSchema)` — it takes the VALUE schema |

`useChatChannel().typingUsers` still yields **names** (`string[]`) while
`<AChatPanel>` wants objects — adapt at the call site.

---

## The editor is a page, a post is not

Every post body is an `<AEditor>` on the reply/thread child doc, via
`AtriumPostEditor`. Two things follow, both learned the hard way:

### `showBreadcrumb` and `showSubPages` default to TRUE

Leaving them on rendered the doc's ancestor chain (*"Atrium Demo Forum › General
› Introductions › <thread>"*) **inside every post body**, and a "PAGES" sub-page
section inside both composers. `AtriumPostEditor` passes
`:show-breadcrumb="false" :show-sub-pages="false"`. Keep them off — a post's
identity comes from its parent thread, which the feed row already shows.

### NEVER read the body with `getText()` / `textBetween()` / `toString()`

The module enforces a structural invariant on every doc body:
`documentHeader@0 + documentMeta@1 + block+`. The `documentHeader` **is the doc
title, as a node inside the body**. So:

- `fragment.toString()` prefixed every posted reply's label with the draft
  placeholder → *"(draft) Audit test reply…"*.
- `doc.textBetween(0, 1000)` threw `TypeError: Cannot read properties of
  undefined (reading 'nodeSize')` for every body under 1000 characters, and
  since it sat in a `try/finally` with no `catch` it rejected `publish()` —
  **thread creation was completely broken**.

Use **`app/utils/editorBodyText.ts`**: `editorBodyText(editor)`,
`xmlFragmentBodyText(fragment)`, `firstLineSummary(text)`. They skip the chrome
nodes and bound every `textBetween` by the node's own `content.size`.

## Drafts are real documents

Both composers create the post as a `meta.draft: true` child doc the moment they
open — that's how autosave and `/drafts` work. Consequences:

- **Public tallies must drop drafts.** `useAtriumNav`'s `threadsForBoard` /
  `repliesForThread` filter through `isPublished()`. Without it a thread's reply
  counter ticked up the instant someone clicked "Reply", before typing a
  character.
- **Publishing is an `update`, not an `add`.** The notify runner watches BOTH
  `add` and `update` on the tree, skips drafts *without marking them seen*, and
  claims the id only once published. Watching only `add` while skipping drafts
  suppresses every notification there is.

## SSR + the doc cache

Docs are server-rendered from the Nitro doc cache, then go live on the client.

**`server/plugins/atrium-doc-cache.ts`** is what makes the cache real. The
module's built-in `doc-tree-cache` runner loads children via
`rootProvider.loadChild()` over the shared Node websocket, and those subdoc
connections **never sync in Node** against this server build — so every cache
entry rendered empty, the render endpoint answered `{ html: "", title: "" }` for
every doc, and every route SSR'd a placeholder that the client replaced on
hydration (a Vue mismatch warning per navigation). The runner re-observes each
tree doc through a **standalone provider** (own `Y.Doc({ guid })` + own socket),
which does sync.

> **Bounded connections — do NOT open one socket per doc.** A standalone provider
> is one WebSocket and the demo tree alone is 100+ docs. Opening them in a burst
> trips `server.max_ws_connections_per_ip` (**default 64**): sockets past the cap
> get `429`, never sync, and their doc renders empty — the exact bug, reintroduced.
> Behind a proxy it's worse: every visitor shares the proxy's IP, so the runner
> starves and the deploy SSRs blank while dev looks fine. The runner renders
> through a pool of `CONCURRENCY = 6` **short-lived** providers (open → sync →
> `observeDoc` → `destroy()` the socket; the retained `Y.Doc` keeps the render)
> plus a 120s refresh sweep.

### The SSR tree seed — why hydration matches

The cache being warm is only half of it. Every page derives its title, counts,
tags and breadcrumb from `useChildTree(doc, …)`, a live Y.Map that **only exists
on the client** — so SSR rendered placeholders and hydration mismatched on every
navigation.

**`server/api/_atrium/tree.get.ts`** serves the whole `doc-tree` out of the cache,
and **`useAtriumNav()` seeds `allEntries` from it** via `useAsyncData` (so the
payload transfers and SSR + the first client render see identical data — that
identity is what makes hydration match). The live map takes over the moment it has
anything; it is deliberately **not** merged with the seed, or an entry deleted
after the snapshot was cached would be resurrected forever.

> **Consequence for page code: READ through `nav.allEntries`, WRITE through
> `tree`.** `tree.entries` / `tree.childrenOf(null)` are live-only and SSR-empty.
> `t/[id]`, `b/[id]`, `c/[id]` and `f/[id]/index` each keep `useChildTree` purely
> as the write handle (`createChild` / `updateMeta` / `deleteEntry`) and derive
> every rendered value from a `treeEntries` computed over `nav.allEntries`. A new
> doc-scoped page must do the same or it reintroduces the mismatch storm.

Verified: all four doc routes render real titles/lists server-side and hydrate
with **zero** console warnings.

Two more cache facts:

- **The `doc-tree` lives ONLY on the root doc's cache slot.** Every label, type
  and meta the render/resolve endpoints return is read from there. The runner
  caches the root explicitly (it isn't a tree entry, so nothing else does) and
  **never** loads the root through a child provider — that opens a second, empty
  Y.Doc whose render clobbers the slot.
- Seeded threads and replies have **no body** (the seed writes tree entries and
  `meta.subtitle`, not doc bodies), so `{}` in their cache json is correct. Check
  a doc you actually typed into before concluding the cache is broken.

## Creating docs: use `createChildRegistered`, not `createChild`

`useChildTree.createChild` is synchronous and registers the doc over REST in the
background — and **that background call loses a race it cannot win**. The
`doc-tree` write is what makes a consumer mount an editor (or the cache runner
open the subdoc), and the server auto-registers a subdoc under the **root** the
socket is attached to. That WS frame rides an already-open socket while the REST
call needs a fresh HTTP round-trip, so the handshake wins by a fraction of a
millisecond — measured here: WS registration at `14:11:51.600389`,
`POST /docs/<parent>/children` → **409 "already exists under a different parent"**
at `14:11:51.600650`. Reordering does not help. Every one of Atrium's POSTs 409'd.

Consequence: the doc is parented to the ROOT in the `documents` table, so the
permission cascade has no ancestor chain for it. Invisible while
`[access].authenticated = editor`; **fatal** the moment a deploy drops visitors to
viewer. The server deliberately refuses to re-parent (audit/22 F21 — silent
re-parenting is a privilege-escalation gadget), so the only correct fix is to
register *before* the tree write.

**`createChildRegistered(parentId, label, type)`** (async) does exactly that.
Both composers use it. Verified in the DB: a new reply now lands as
`parent_id = <the thread>, doc_type = "reply"` with no 409, where pre-fix docs sit
at the root with a NULL type.

## Presence

`useAwarenessPeers()` everywhere. Identity is `peer.user.publicKey`.

- **A member is a peer that publishes an identity.** Atrium's own Nitro process
  holds a root-doc socket and sets no awareness `user`, so it surfaced in the
  member panel as an online member called "guest", inflating "ONLINE — n" by one
  on every page. `AtriumRightRail`'s `isMemberPeer()` filters it out; so do
  `useAtriumOnlinePeers` and the mention provider.
- **Resolve display names through awareness before falling back to the pubkey.**
  `authorLabel()` in `pages/t/[id].vue` used to slice the pubkey
  unconditionally, so a byline read "exvkibJG" while its author sat in the member
  panel as "Deft-Mage".
- **Voice signals SDP/ICE over awareness fields**, not the server's WebRTC
  signaling — `atrium-voice` (membership) and `atrium-voice-signals` (offers /
  answers / ICE) in `useAtriumVoice.ts`. It's independent of the module's
  `features.webrtc` flag, which is off.

## Third-party duplication

`nuxt.config.ts` carries a long `vite.optimizeDeps.include` + `resolve.dedupe`
list for yjs / TipTap / ProseMirror / CodeMirror. Don't trim it — duplicates
cause "Yjs was already imported" and `Adding different instances of a keyed
plugin`.

The type-level twin: `@abraca/schema` is consumed from the sibling
`abracadabra-ts` repo over a node_modules symlink, so `import { z } from "zod"`
resolves a **different physical zod copy** than the package's declarations were
compiled against. `ZodType` is invariant in its internals, so nothing from one
satisfies a parameter typed by the other and `ymap(z.number())` fails to
typecheck on perfectly correct code. A `pnpm.overrides` version pin does NOT fix
it (the directories stay distinct). **Import `z` from `@abraca/schema`**, which
re-exports its own instance for exactly this reason.

## Commands

```bash
pnpm dev          # Nuxt on :3401 — start the backend FIRST (see above)
pnpm build        # production build
pnpm typecheck    # vue-tsc (needs .nuxt/ — run `npx nuxi prepare` if missing)
```

Package manager: **pnpm**. `.npmrc` sets `shamefully-hoist=true` +
`legacy-peer-deps=true`.

## Conventions / gotchas

- Lucide icons only (kebab-case). Accent is `orange`, neutral `sand`.
- `relativeTime()` in `app/utils/relativeTime.ts` returns a COMPLETE phrase
  ("just now", "5m ago"). Never append " ago" — that's how the landing page came
  to say "just now ago". Use `plural(n, "thread")` rather than `{{ n }} threads`.
- `server/api/og/[id].get.ts` optional-imports `satori` + `@resvg/resvg-js` to
  upgrade share cards from SVG to PNG. They are deliberately NOT dependencies
  (native binaries); the SVG fallback is the normal path and the build's
  "could not be resolved" warning is expected.
- Atrium ships **no RPC v1 handlers** despite what `DOCKER.md` implies. Visitor
  writes go straight to the CRDT, which only works because the compose sets
  `authenticated = editor` — the server logs
  `SECURITY: access.authenticated grants write` at boot. If Atrium is ever locked
  down to `viewer` (the modern posture, as in janis-io), every member write has
  to move behind an RPC runner first.

## ⚠️ Unreleased SDK dependencies (as of 2026-07-30)

Atrium consumes `@abraca/*` through **node_modules symlinks to the sibling repos**,
so local dev picks up SDK source immediately — but **Docker installs from npm**.
The 2026-07-30 audit fixed several things *in the SDK* that Atrium now depends on,
and they are **unpublished**. A Docker build before the next
`wand bump --ts && wand publish --ts` will regress:

| Package | Fix Atrium depends on |
|---|---|
| `@abraca/nuxt` | `useChildTree.createChildRegistered` — the only way to avoid the 409 / root-parenting above |
| `@abraca/nuxt` | `useNotifications` ported from the dead `notify:*` dialect to `messages:inbox_*` (the inbox is empty without it) |
| `@abraca/nuxt` | render + resolve endpoints read the tree entry from the ROOT doc's cache (they returned empty titles for every child doc) |
| `@abraca/nuxt` | `getCachedHTML`/`getCachedJSON` fall back to `useStorage()` instead of returning null before `initDocCache` |
| `@abraca/nuxt` | `buildDmChannelId` → real `deriveDmDocId`; `ensureDmChannel` added |
| `@abraca/nuxt` | one `AwarenessUser` (the narrow copy in `useYDoc.ts` shadowed the real one, dropping `publicKey`) |
| `@abraca/nuxt` | `AppNotification` / `NotificationType` re-exported from the entrypoint |
| `@abraca/nuxt` | chat `senderName` falls back on empty string, not just null (blank bylines) |
| `@abraca/dabra` | `deriveDmDocId` exported; `createDoc` accepts `kind` / `public_access` |
| `@abraca/schema` | `ymap()`/`yarray()` accept concrete zod types; `z` re-exported |

Check `npm view @abraca/nuxt version` against the local `package.json` before
assuming a deploy has them.

## Docker

See `DOCKER.md`. `docker-compose.yml` brings up the forum plus its own dedicated
server with the service account pre-provisioned. Rotate
`ABRA_AUTH_JWT_SECRET`, the admin password **and the service keypair** for
anything real.
