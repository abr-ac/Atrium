import { atriumSchema } from "~/schema/atrium";

/**
 * Attach the Atrium schema registry before @abraca/nuxt's client plugin boots
 * the provider. The registry covers the eight Atrium-specific roots (forum,
 * category, board, thread, channel, profile, inbox, read-state) plus the
 * built-in renderer page types a forum may host inside it.
 *
 * Per `schema-free-core` memory: this is *additive*. Unknown types still pass
 * through unchecked — the registry only enforces shape on types it knows.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("abracadabra:before-boot", (ctx) => {
    ctx.attachSchema(atriumSchema);
  });
});
