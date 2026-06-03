// Atrium shell preferences — sidebar width persisted to localStorage. Module-
// level singletons so every consumer sees the same reactive values.

import { useLocalStorage } from "@vueuse/core";

const SIDEBAR_KEY = "atrium:sidebar:w";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 260;

let _sidebarWidth: ReturnType<typeof useLocalStorage<number>> | null = null;

export function useAtriumShellPrefs() {
  if (!_sidebarWidth) {
    _sidebarWidth = useLocalStorage<number>(SIDEBAR_KEY, SIDEBAR_DEFAULT, {
      listenToStorageChanges: true,
    });
  }
  return {
    sidebarWidth: _sidebarWidth,
    SIDEBAR_MIN,
    SIDEBAR_MAX,
    SIDEBAR_DEFAULT,
  };
}
