// useAtriumDM — module-level singleton for opening the global DM modal from
// anywhere (peer card, user page, command palette). The modal lives in the
// default layout; this composable just toggles its target.

interface DMTarget {
  pubkey: string;
  name: string;
  color?: string;
}

const open = ref(false);
const target = ref<DMTarget | null>(null);

export function useAtriumDM() {
  function openWith(t: DMTarget) {
    target.value = t;
    open.value = true;
  }
  function close() {
    open.value = false;
  }
  return { open, target, openWith, close };
}
