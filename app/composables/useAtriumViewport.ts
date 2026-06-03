// useAtriumViewport — minimal breakpoint detection for responsive layout
// decisions. Wraps window.matchMedia so we can react to viewport changes.

const MOBILE_QUERY = "(max-width: 767px)";
const TABLET_QUERY = "(max-width: 1023px)";

let _isMobile: Ref<boolean> | null = null;
let _isNarrow: Ref<boolean> | null = null;

function trackMedia(query: string): Ref<boolean> {
  const r = ref(false);
  if (import.meta.client) {
    const mq = window.matchMedia(query);
    r.value = mq.matches;
    const handler = (e: MediaQueryListEvent) => { r.value = e.matches; };
    mq.addEventListener("change", handler);
  }
  return r;
}

export function useAtriumViewport() {
  if (!_isMobile) _isMobile = trackMedia(MOBILE_QUERY);
  if (!_isNarrow) _isNarrow = trackMedia(TABLET_QUERY);
  return {
    isMobile: _isMobile,
    isNarrow: _isNarrow,
  };
}
