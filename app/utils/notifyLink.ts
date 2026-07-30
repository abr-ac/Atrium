/**
 * The other half of the notification deep-link convention.
 *
 * A server `InboxEntry` carries who/where/when plus an opaque `preview` — there
 * is NO `link` field, and the only doc reference is `channel_doc_id` (for Atrium
 * that's the forum, not the thread). So `server/runners/atrium-notify.ts` appends
 * the in-app path to the message body behind a marker, and the inbox strips it
 * back off for display.
 *
 * Keep `NOTIFY_LINK_MARKER` here identical to the runner's copy — the two
 * constants ARE the contract. (They can't share a module: the runner is Nitro
 * server code, this is the client bundle.)
 */

export const NOTIFY_LINK_MARKER = " ⟦link:";

export interface ParsedNotifyBody {
  /** The body with the link marker removed — safe to render. */
  text: string;
  /** In-app path to open, e.g. `/t/<threadId>`, or null when unlinked. */
  link: string | null;
}

/**
 * Split a notification body into display text + deep link.
 *
 * Tolerates bodies with no marker (older entries, DMs, anything the server
 * synthesised itself) by returning the input unchanged with a null link, and
 * only accepts app-relative paths so a crafted message body can't turn a
 * notification row into an off-site link.
 */
export function parseNotifyBody(body: string | undefined | null): ParsedNotifyBody {
  const raw = body ?? "";
  const at = raw.lastIndexOf(NOTIFY_LINK_MARKER);
  if (at === -1) return { text: raw, link: null };

  const close = raw.indexOf("⟧", at);
  if (close === -1) return { text: raw, link: null };

  const candidate = raw.slice(at + NOTIFY_LINK_MARKER.length, close).trim();
  const text = (raw.slice(0, at) + raw.slice(close + 1)).trim();
  // App-relative only: a single leading slash, never `//host` or a scheme.
  const link = /^\/(?!\/)[\w\-./?#=&%:]*$/.test(candidate) ? candidate : null;
  return { text, link };
}
