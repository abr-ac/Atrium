// useAtriumForumTheme — applies the active forum's accent color to the
// document root as `--ui-primary-*` CSS variables. Cascades through every
// Atrium element that reads `var(--ui-primary)` so each forum can have a
// recognisable visual identity without forking the UI.
//
// The forum's chosen color is a Tailwind palette name stored in
// `forum.meta.color`. When the user leaves the forum (no active forum or
// no color set), we restore the document's default by clearing the
// overrides. Other CSS still wins because `--ui-primary-*` at `:root` is
// the base layer.

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const STORE_KEY = "__atriumForumTheme";

function applyAccent(color: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Track what we own so we can clean up surgically on switch.
  const owned = (root as any)[STORE_KEY] as Set<string> | undefined;
  if (owned) {
    for (const name of owned) root.style.removeProperty(name);
  }
  if (!color) {
    (root as any)[STORE_KEY] = new Set();
    return;
  }
  const next = new Set<string>();
  for (const shade of SHADES) {
    const name = `--ui-color-primary-${shade}`;
    // Mirror Nuxt UI's own pattern: refer to the Tailwind color var.
    const value = `var(--color-${color}-${shade})`;
    root.style.setProperty(name, value);
    next.add(name);
  }
  (root as any)[STORE_KEY] = next;
}

export function useAtriumForumTheme() {
  const nav = useAtriumNav();
  const abra = useAbracadabra();

  // Only apply the theme when the user hasn't picked a personal accent —
  // their identity color wins. `abra.userColorName` is set to a Tailwind
  // name when the user explicitly picks one.
  const forumColor = computed(() => {
    const forum = nav.trail.value.forum;
    if (!forum) return null;
    const c = (forum.meta as any)?.color as string | undefined;
    return typeof c === "string" && c ? c : null;
  });

  const userColor = computed(() => abra.userColorName?.value ?? "");

  function recompute() {
    // User's personal accent overrides forum theme. This keeps individual
    // identity legible even in heavily-branded forums. When the user has
    // a picked color, apply it as the primary; falling back to the forum
    // accent when no personal color is set.
    if (userColor.value) applyAccent(userColor.value);
    else applyAccent(forumColor.value);
  }

  watch([forumColor, userColor], () => recompute(), { immediate: true });
  onScopeDispose?.(() => applyAccent(null));

  return { forumColor, userColor };
}
