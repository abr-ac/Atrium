/**
 * Registers the Atrium demo-seed runner with the abracadabra-nuxt server
 * runner registry. Runs in-process inside the Nitro server alongside the
 * built-in `doc-tree-cache` runner.
 *
 * No-op when the abracadabra-service Nitro plugin is disabled (no service
 * keys configured) — the registry's hook simply never fires.
 */
import { defineNitroPlugin } from "nitropack/runtime/plugin";
// `registerServerPlugin` is auto-imported by @abraca/nuxt
// (addServerImportsDir → src/runtime/server/utils).
import { atriumSeedRunner } from "../runners/atrium-seed";
import { atriumNotifyRunner } from "../runners/atrium-notify";
import { atriumOgCacheRunner } from "../runners/atrium-og-cache";

export default defineNitroPlugin((nitroApp) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom Nitro hook not in type augmentation
  (nitroApp.hooks as any).hook("abracadabra:before-runners", () => {
    registerServerPlugin({
      name: "atrium:demo",
      serverRunners: [atriumSeedRunner, atriumNotifyRunner, atriumOgCacheRunner],
    });
  });
});
