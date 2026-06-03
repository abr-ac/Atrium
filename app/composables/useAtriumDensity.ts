// useAtriumDensity — comfortable / compact density preference. Persisted to
// localStorage and reflected on <html data-atrium-density="..."> so CSS can
// branch via the [data-atrium-density="compact"] attribute selector.

import { useLocalStorage } from "@vueuse/core";

const KEY = "atrium:density";

export type Density = "comfortable" | "compact";

let _density: ReturnType<typeof useLocalStorage<Density>> | null = null;

export function useAtriumDensity() {
  if (!_density) {
    _density = useLocalStorage<Density>(KEY, "comfortable", {
      listenToStorageChanges: true,
    });
    if (import.meta.client) {
      // Reflect onto <html> on every change.
      watchEffect(() => {
        document.documentElement.dataset.atriumDensity = _density!.value;
      });
    }
  }

  function toggle() {
    _density!.value = _density!.value === "compact" ? "comfortable" : "compact";
  }

  const isCompact = computed(() => _density!.value === "compact");

  return {
    density: _density!,
    isCompact,
    toggle,
  };
}
