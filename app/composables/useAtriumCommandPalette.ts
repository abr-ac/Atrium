// useAtriumCommandPalette — module-level singleton for the ⌘K palette's open
// state, so any page can open it without reaching into the layout.
//
// The state used to be a plain `ref` local to `layouts/default.vue`. The landing
// page's "Search · ⌘K" button therefore had no way to reach it and faked one:
//
//   @click="$el.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))"
//
// which (a) doesn't typecheck — `$el` isn't in a `<script setup>` page's render
// scope, so Vue resolved it against the auto-import surface — and (b) depends on
// a synthetic, non-trusted key event reaching the global hotkey handler. Both
// go away with a shared ref.

const open = ref(false);

export function useAtriumCommandPalette() {
  return {
    open,
    show: () => { open.value = true; },
    hide: () => { open.value = false; },
    toggle: () => { open.value = !open.value; },
  };
}
