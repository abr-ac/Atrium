/**
 * Plain text of an <AEditor>'s BODY — excluding the `documentHeader` (the doc
 * TITLE renders inside the editor as a node!) and the `documentMeta` chip row.
 *
 * ## Why this exists
 *
 * Two bugs, one cause. Since @abraca/nuxt started enforcing the structural
 * invariant `documentHeader@0 + documentMeta@1 + block+` on every doc body,
 * anything that reads "the body" off the editor also reads the title:
 *
 *  1. `ReplyComposer.summarizeBody()` stringified the whole `Y.XmlFragment`
 *     and derived the reply's tree label from it, so every posted reply was
 *     named `"(draft) <the actual text>"` — the draft placeholder title glued
 *     onto the front. (Same class of bug janis-io hit with `editor.getText()`.)
 *  2. `NewThreadComposer.publish()` called `doc.textBetween(0, 1000)` to scan
 *     for `@here`. ProseMirror throws `TypeError: Cannot read properties of
 *     undefined (reading 'nodeSize')` whenever `to` exceeds the doc size —
 *     i.e. for every body under 1000 characters — and because the call sat in
 *     a `try { } finally { }` with no `catch`, `publish()` rejected and
 *     **thread creation was completely broken**.
 *
 * Every "derive a label / mirror / mention-scan from the body" call site must
 * go through here. Never `editor.getText()`, never a raw `textBetween` with a
 * guessed upper bound, never `fragment.toString()`.
 */

interface PmNodeLike {
  type: { name: string };
  content: { size: number };
  textBetween: (from: number, to: number, blockSeparator?: string) => string;
}

interface EditorLike {
  state: { doc: { forEach: (cb: (node: PmNodeLike) => void) => void } };
}

/** Structural nodes the module injects around the body. Never body text. */
const CHROME_NODES = new Set(["documentHeader", "documentMeta"]);

/**
 * Body text from a live TipTap editor instance. Walks top-level nodes and
 * bounds each `textBetween` by that node's own `content.size`, so it can
 * never run off the end of the document.
 */
export function editorBodyText(editor: EditorLike | null | undefined): string {
  if (!editor?.state?.doc) return "";
  let text = "";
  editor.state.doc.forEach((node) => {
    if (CHROME_NODES.has(node.type.name)) return;
    const t = node.textBetween(0, node.content.size, "\n");
    if (t) text += (text ? "\n" : "") + t;
  });
  return text.trim();
}

/**
 * Body text straight off a `Y.XmlFragment`, for call sites that have the CRDT
 * but no mounted editor. Skips the same chrome nodes by element name.
 */
export function xmlFragmentBodyText(fragment: unknown): string {
  const frag = fragment as
    | { toArray?: () => unknown[] }
    | null
    | undefined;
  const nodes = frag?.toArray?.();
  if (!nodes) return "";
  const parts: string[] = [];
  for (const node of nodes) {
    const el = node as { nodeName?: string, toString?: () => string };
    if (el?.nodeName && CHROME_NODES.has(el.nodeName)) continue;
    const raw = el?.toString?.() ?? "";
    const plain = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (plain) parts.push(plain);
  }
  return parts.join("\n").trim();
}

/**
 * First line of `text`, collapsed and clipped to `max` characters — the shape
 * Atrium uses for a reply's doc-tree label.
 */
export function firstLineSummary(text: string, max = 120, fallback = "(reply)"): string {
  const firstLine = text.split("\n").map(l => l.trim()).find(l => l.length > 0) ?? "";
  const collapsed = firstLine.replace(/\s+/g, " ").trim();
  if (!collapsed) return fallback;
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}
