/**
 * Publishes the service-role client so Nitro routes can use it.
 *
 * A trivial runner whose only job is to stash `ctx.client` — the service
 * identity's REST client — into `server/utils/atriumService.ts`. Nitro routes
 * can't reach `ServerRunnerContext` any other way.
 *
 * Needed because some operations are legitimately privileged and cannot be done
 * by a member: creating a DM document. A DM doc lives at the **server root**, and
 * Atrium's forum posture sets `[access].allow_user_top_level = false` so only
 * admins create top-level docs ("only admins / the service runner create top-level
 * forums"). A member's `POST /docs` therefore returns
 * `403 forbidden: insufficient permissions` — which is exactly why DMs failed to
 * persist. The service account is root admin, so it does the create on the
 * member's behalf after the route verifies who the member is.
 */
import type { ServerRunnerContext } from "@abraca/nuxt";
import { setServiceClient } from "../utils/atriumService";

export default defineNitroPlugin((nitroApp) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- hook contributed by @abraca/nuxt's Nitro plugin
  (nitroApp.hooks as any).hook("abracadabra:before-runners", () => {
    registerServerPlugin({
      name: "atrium:service-handle",
      serverRunners: [
        {
          name: "atrium:service-handle",
          async start(ctx: ServerRunnerContext) {
            setServiceClient(ctx.client);
            console.log("[atrium:service-handle] service client published");
            return undefined;
          },
        },
      ],
    });
  });
});
