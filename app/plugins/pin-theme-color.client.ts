/**
 * Pin the playground identity colour to orange / sand before the
 * Abracadabra client plugin reads localStorage on boot. Without this,
 * @abraca/nuxt derives per-user colours from the public key and overwrites
 * `appConfig.ui.colors.primary` / `neutral`, undoing app.config.ts.
 *
 * `parallel: false` + `name: 'pin-theme-color'` ordering keeps it ahead of
 * the abracadabra-client plugin (which runs unordered). The values are
 * idempotent — set every page load so a stale entry from an older session
 * can't bleed through.
 */
export default defineNuxtPlugin({
  name: 'pin-theme-color',
  enforce: 'pre',
  setup() {
    if (import.meta.server) return
    try {
      localStorage.setItem('abracadabra_usercolor', 'orange')
      localStorage.setItem('abracadabra_neutralcolor', 'sand')
    }
    catch { /* sessionStorage disabled */ }
  },
})
