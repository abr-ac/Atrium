// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ["@abraca/nuxt", "@nuxt/ui", "@vueuse/nuxt"],

  components: [{ path: "~/components", pathPrefix: false }],

  css: ["~/assets/css/main.css"],

  colorMode: {
    preference: "system",
  },

  devServer: {
    port: 3401,
  },

  compatibilityDate: "latest",

  runtimeConfig: {
    public: {
      abracadabraUrl: process.env.ABRACADABRA_URL ?? "http://localhost:4000",
      atrium: {
        // Phase 0 default: HN-style threading is opt-in.
        // Per-forum override via space.meta.atrReplyMode is layered on top in Phase 5+.
        replyMode: (process.env.NUXT_PUBLIC_ATRIUM_REPLY_MODE ?? "flat") as "flat" | "threaded",
        // Optional TURN server for voice mesh — required for NAT'd peers
        // who can't reach each other via STUN alone. Leave blank to skip.
        turn: {
          url: process.env.NUXT_PUBLIC_ATRIUM_TURN_URL ?? "",
          username: process.env.NUXT_PUBLIC_ATRIUM_TURN_USERNAME ?? "",
          credential: process.env.NUXT_PUBLIC_ATRIUM_TURN_CREDENTIAL ?? "",
        },
      },
    },
  },

  abracadabra: {
    url: process.env.ABRACADABRA_URL ?? "http://localhost:4000",
    // Land guests on the server-root hub so every visitor sees the same forum
    // directory (the children of the server root are the forum spaces). Per
    // memory `entry-doc-required`, omitting this scatters guests onto per-
    // identity private spaces and they never see each other.
    entryDocId: process.env.NUXT_PUBLIC_ATRIUM_ENTRY_DOC_ID
      ?? "00000000-0000-0000-0000-000000000000",
    docBasePath: "/d",
    debug: true,
    service: {
      publicKey: process.env.NUXT_ABRACADABRA_SERVICE_PUBLIC_KEY ?? "",
      privateKey: process.env.NUXT_ABRACADABRA_SERVICE_PRIVATE_KEY ?? "",
    },
    features: {
      editor: true,
      search: true,
      backgroundSync: true,
      renderers: true,
      broadcastSync: true,
      webrtc: false,
      chat: true,
      media: true,
    },
    schema: {
      validate: true,
      migrateOnRead: true,
      bundleDir: "../abracadabra-ts/packages/schema/src/generated/json-schema",
    },
  },

  // Dedupe Yjs + TipTap + ProseMirror + CodeMirror via Vite's pre-bundle so
  // there's a single instance per page. Without this, the dev server logs
  // "Yjs was already imported" and CRDT constructor checks misfire under HMR.
  // Copied from abracadabra-aperio (the canonical standalone consumer).
  vite: {
    optimizeDeps: {
      include: [
        "prosemirror-view",
        "prosemirror-state",
        "prosemirror-model",
        "prosemirror-transform",
        "prosemirror-tables",
        "prosemirror-gapcursor",
        "prosemirror-dropcursor",
        "prosemirror-commands",
        "prosemirror-keymap",
        "prosemirror-history",
        "prosemirror-inputrules",
        "prosemirror-schema-list",
        "nanoevents",
        "@tiptap/core",
        "@tiptap/vue-3",
        "@tiptap/starter-kit",
        "@tiptap/extension-table",
        "@tiptap/extension-table-row",
        "@tiptap/extension-table-header",
        "@tiptap/extension-table-cell",
        "@tiptap/extension-collaboration",
        "@tiptap/extension-collaboration-caret",
        "@tiptap/extension-task-list",
        "@tiptap/extension-task-item",
        "@tiptap/extension-character-count",
        "@tiptap/extension-text-align",
        "@tiptap/extension-highlight",
        "@tiptap/extension-color",
        "@tiptap/extension-text-style",
        "@tiptap/extension-superscript",
        "@tiptap/extension-subscript",
        "@tiptap/extension-code-block-lowlight",
        "lowlight",
        "yjs",
        "@abraca/dabra",
        // Note: @noble/* deliberately omitted — Atrium pulls v2.x where the
        // /sha512 subpath was dropped. Vite will resolve them via normal
        // transitive resolution.
        "@vueuse/core",
        "@codemirror/view",
        "@codemirror/state",
        "@codemirror/language",
        "@codemirror/commands",
        "@codemirror/autocomplete",
        "@codemirror/search",
        "@codemirror/lang-javascript",
        "@codemirror/lang-css",
        "@codemirror/lang-vue",
        "@codemirror/lang-json",
        "y-codemirror.next",
      ],
    },
    // Without dedupe, sibling-linked workspaces can resolve prosemirror-*
    // and tiptap-* packages from two different node_modules trees, causing
    // duplicate-schema crashes ("Duplicate use of selection JSON ID cell")
    // the moment multiple <AEditor> instances mount on the same page.
    resolve: {
      dedupe: [
        "vue",
        "yjs",
        "y-protocols",
        "prosemirror-view",
        "prosemirror-state",
        "prosemirror-model",
        "prosemirror-transform",
        "prosemirror-tables",
        "prosemirror-gapcursor",
        "prosemirror-dropcursor",
        "prosemirror-commands",
        "prosemirror-keymap",
        "prosemirror-history",
        "prosemirror-inputrules",
        "prosemirror-schema-list",
        "@tiptap/core",
        "@tiptap/vue-3",
        "@tiptap/pm",
      ],
    },
  },
});
