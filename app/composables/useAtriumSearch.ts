// useAtriumSearch — minimal full-text search over the doc tree.
//
// Scans every entry's `label` plus `meta.subtitle` / `meta.body` for the
// query terms. Splits on whitespace and requires every term to match (AND
// semantics). Returns ranked hits with a snippet around the match.
//
// This is a v0 scan that runs on the client over the already-loaded tree —
// no index, no server help. Works fine up to a few thousand entries.

export interface SearchHit {
  id: string;
  type: string;
  label: string;
  threadId: string | null;
  threadLabel: string | null;
  boardLabel: string | null;
  forumId: string | null;
  forumLabel: string | null;
  forumIcon: string | null;
  snippet: string;
  href: string;
  score: number;
}

export interface SearchOptions {
  /** "this" = active forum only; "all" = every forum loaded in the tree. */
  scope?: "this" | "all";
  /** Active forum id for `scope: "this"`. */
  activeForumId?: string | null;
  limit?: number;
}

export function useAtriumSearch() {
  const nav = useAtriumNav();

  function search(query: string, options: SearchOptions = {}): SearchHit[] {
    const limit = options.limit ?? 30;
    const scope = options.scope ?? "this";
    const activeForumId = options.activeForumId ?? null;
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    const entries = nav.allEntries.value;
    const entryById = new Map(entries.map((e) => [e.id, e]));

    // Helper: walk up to find the containing thread + board + forum.
    function ancestors(id: string): {
      thread?: { id: string; label: string };
      board?: { label: string };
      forum?: { id: string; label: string; icon: string | null };
    } {
      let cur = entryById.get(id);
      const out: ReturnType<typeof ancestors> = {};
      let safety = 0;
      while (cur && safety++ < 32) {
        if (cur.type === "thread") out.thread = { id: cur.id, label: cur.label };
        if (cur.type === "board") out.board = { label: cur.label };
        if (cur.type === "forum") {
          out.forum = {
            id: cur.id,
            label: cur.label,
            icon: ((cur.meta as any)?.icon as string) ?? null,
          };
        }
        if (!cur.parentId) break;
        cur = entryById.get(cur.parentId);
      }
      return out;
    }

    function snippetAround(text: string, around: string): string {
      const i = text.toLowerCase().indexOf(around);
      if (i === -1) return text.slice(0, 140);
      const start = Math.max(0, i - 40);
      const end = Math.min(text.length, i + around.length + 80);
      const prefix = start > 0 ? "…" : "";
      const suffix = end < text.length ? "…" : "";
      return prefix + text.slice(start, end).trim() + suffix;
    }

    const hits: SearchHit[] = [];
    for (const e of entries) {
      if (e.type === "reaction") continue;
      const meta = (e.meta ?? {}) as Record<string, unknown>;
      const label = (e.label ?? "").toString();
      const subtitle = (meta.subtitle as string) ?? "";
      const body = (meta.body as string) ?? "";
      const hay = [label, subtitle, body]
        .filter(Boolean)
        .map((s) => s.toString().replace(/<[^>]*>/g, " "))
        .join(" \n ");
      const haystackLc = hay.toLowerCase();

      let allMatch = true;
      let score = 0;
      for (const t of terms) {
        const idx = haystackLc.indexOf(t);
        if (idx === -1) { allMatch = false; break; }
        // Earlier matches + label hits weight more
        score += 5 - Math.min(5, idx / 50);
        if (label.toLowerCase().includes(t)) score += 4;
      }
      if (!allMatch) continue;

      const ctx = ancestors(e.id);
      // Scope filter: only apply when we know which forum is active. Outside
      // a forum (e.g. landing on /search directly), "this" degrades to "all".
      if (scope === "this" && activeForumId && ctx.forum?.id !== activeForumId) {
        continue;
      }
      hits.push({
        id: e.id,
        type: e.type ?? "post",
        label: label || "(untitled)",
        threadId: ctx.thread?.id ?? (e.type === "thread" ? e.id : null),
        threadLabel: ctx.thread?.label ?? (e.type === "thread" ? label : null),
        boardLabel: ctx.board?.label ?? null,
        forumId: ctx.forum?.id ?? null,
        forumLabel: ctx.forum?.label ?? null,
        forumIcon: ctx.forum?.icon ?? null,
        snippet: snippetAround(hay, terms[0] ?? ""),
        href: e.type === "thread"
          ? `/t/${e.id}`
          : ctx.thread?.id
            ? `/t/${ctx.thread.id}#${e.id}`
            : `/`,
        score,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  return { search };
}
