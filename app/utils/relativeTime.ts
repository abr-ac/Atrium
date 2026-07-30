/**
 * Human-readable "how long ago" for a millisecond timestamp.
 *
 * Single source of truth: this was copy-pasted into EIGHT files (index, inbox,
 * drafts, search, t/[id], b/[id], v/[id], dm/index, u/[pubkey]) which drifted —
 * and one of the copies is why the landing page rendered "just now ago": the
 * function returns a complete phrase, but `index.vue`'s template appended a
 * literal " ago" on top of it.
 *
 * The returned string is ALWAYS complete. Never append anything to it.
 *
 * `empty` is what a missing timestamp renders as — the old copies disagreed
 * ("" in feeds, "—" in list rows), so it's a parameter rather than a silent
 * behaviour change at seven call sites.
 */
export function relativeTime(ts: number | undefined | null, empty = ""): string {
  if (!ts) return empty;
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

/** `1 thread` / `2 threads` — pluralisation that doesn't say "1 threads". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
