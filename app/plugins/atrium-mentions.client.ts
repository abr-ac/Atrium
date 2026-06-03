// Atrium peer mention provider — contributes connected peers to the
// editor's native `@`-suggestion popup. Replaces atrium's standalone
// AtriumMentionPicker + AtriumMentionFloating with the @abraca/nuxt
// mention infrastructure already wired into <AEditor>.

import type { AbracadabraPlugin } from "@abraca/nuxt";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("abracadabra:before-boot", (ctx) => {
    const plugin: AbracadabraPlugin = {
      name: "atrium-mentions",
      label: "Atrium peer mentions",
      mentionProviders: [
        {
          label: "People",
          getItems(query) {
            // Pull the latest peer list off the awareness composable each
            // call so the suggestion popup reflects who's actually online
            // right now (no stale snapshot).
            const peers = useAwarenessPeers().peers.value ?? [];
            const me = useAbracadabra().publicKeyB64?.value ?? "";
            const q = query.trim().toLowerCase();
            const items = peers
              .filter((p) => {
                const pubkey = p.user?.publicKey;
                if (!pubkey || pubkey === me) return false;
                if (!q) return true;
                const name = (p.user?.name ?? "").toLowerCase();
                return name.includes(q) || pubkey.toLowerCase().startsWith(q);
              })
              .map((p) => {
                const pubkey = p.user!.publicKey!;
                return {
                  id: pubkey,
                  label: p.user?.name ?? pubkey.slice(0, 8),
                  color: p.user?.color ?? undefined,
                };
              });
            return items.slice(0, 20);
          },
        },
      ],
    };
    ctx.attachPlugin(plugin);
  });
});
