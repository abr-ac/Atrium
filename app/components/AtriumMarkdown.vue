<script setup lang="ts">
// Lightweight markdown renderer for plaintext post fallbacks. Handles the
// common forum subset:
//   • **bold** / __bold__
//   • *italic* / _italic_
//   • `inline code`
//   • ```fenced code```
//   • # ## ### headings
//   • > blockquote
//   • - / * list items
//   • [label](url) links + autolinked bare http(s) URLs
//   • @<pubkey-prefix> mentions → /u/<pubkey>
//
// Input is HTML-escaped first; nothing in the output runs script. Anything
// the renderer doesn't recognise survives as escaped text.

const props = defineProps<{
  source: string;
}>();

const nav = useAtriumNav();

// Source is split on `![[id]]` embed tokens into segments. Each html
// segment is rendered through the markdown pipeline; each embed segment
// mounts the relevant Vue component (currently only AtriumPoll).
type Segment = { kind: "html"; value: string } | { kind: "embed"; id: string };
const EMBED_RE = /!\[\[([A-Za-z0-9_-]+)\]\]/g;

const segments = computed<Segment[]>(() => {
  const src = props.source ?? "";
  if (!src) return [];
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  EMBED_RE.lastIndex = 0;
  while ((m = EMBED_RE.exec(src)) !== null) {
    if (m.index > last) {
      out.push({ kind: "html", value: render(src.slice(last, m.index)) });
    }
    out.push({ kind: "embed", id: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < src.length) {
    out.push({ kind: "html", value: render(src.slice(last)) });
  }
  if (!out.length) out.push({ kind: "html", value: render(src) });
  return out;
});

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(s: string): string {
  let out = s;
  // Inline code (highest priority — keep tokens raw inside backticks)
  out = out.replace(/`([^`]+)`/g, (_, code) =>
    `<code class="atrium-md__code-inline">${code}</code>`,
  );
  // Bold (**x**, __x__)
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic (*x*, _x_) — careful not to match ** patterns; the regex above
  // already removed them, so this is safe.
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  // Explicit [label](url) links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safe = /^(https?:|\/|mailto:|#)/.test(url) ? url : "#";
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  // Bare http(s) URLs
  out = out.replace(/(^|[^"])(https?:\/\/[^\s<]+[^\s<.,:;!?])/g, (_, prev, url) =>
    `${prev}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );
  // Broad mentions (@everyone, @here) — keep them as a distinct chip even
  // though they don't resolve to a single peer.
  out = out.replace(/@(everyone|here)\b/g, (_full, kind) =>
    `<span class="atrium-md__mention atrium-md__mention--broad" data-broad="${kind}">@${kind}</span>`,
  );
  // @<pubkey-prefix> mentions — resolve via known authors. Min 6 chars.
  out = out.replace(/@([A-Za-z0-9_-]{6,})/g, (full, needle) => {
    const target = lookupMention(needle);
    if (!target) return full;
    return `<a class="atrium-md__mention" href="/u/${target.pubkey}">@${target.label}</a>`;
  });
  return out;
}

function lookupMention(prefix: string): { pubkey: string; label: string } | null {
  const lc = prefix.toLowerCase();
  for (const e of nav.allEntries.value) {
    const author = (e.meta as any)?.author as string | undefined;
    if (!author || author === "seed") continue;
    if (author.toLowerCase().startsWith(lc)) {
      return { pubkey: author, label: author.slice(0, prefix.length) };
    }
  }
  return null;
}

function render(src: string): string {
  if (!src) return "";
  const escaped = escapeHTML(src);
  const lines = escaped.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];
  let listOpen = false;
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length === 0) return;
    out.push(`<p>${inline(paragraphBuf.join(" "))}</p>`);
    paragraphBuf = [];
  };
  const closeList = () => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw;
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push(`<pre class="atrium-md__code-block"><code>${codeBuffer.join("\n")}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      }
      else {
        flushParagraph();
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "") {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1]!.length;
      out.push(`<h${level} class="atrium-md__h${level}">${inline(heading[2]!)}</h${level}>`);
      continue;
    }
    if (/^>\s+/.test(trimmed)) {
      flushParagraph();
      closeList();
      out.push(`<blockquote class="atrium-md__quote">${inline(trimmed.replace(/^>\s+/, ""))}</blockquote>`);
      continue;
    }
    const li = /^[-*]\s+(.*)/.exec(trimmed);
    if (li) {
      flushParagraph();
      if (!listOpen) {
        out.push(`<ul class="atrium-md__list">`);
        listOpen = true;
      }
      out.push(`<li>${inline(li[1]!)}</li>`);
      continue;
    }
    closeList();
    paragraphBuf.push(trimmed);
  }
  flushParagraph();
  closeList();
  if (inCode) {
    // Unterminated fence — render as-is.
    out.push(`<pre class="atrium-md__code-block"><code>${codeBuffer.join("\n")}</code></pre>`);
  }
  return out.join("\n");
}
</script>

<template>
  <div class="atrium-md">
    <template v-for="(seg, i) in segments" :key="i">
      <AtriumPoll v-if="seg.kind === 'embed'" :poll-id="seg.id" />
      <div v-else class="atrium-md__html" v-html="seg.value" />
    </template>
  </div>
</template>

<style scoped>
.atrium-md {
  font-size: 0.92rem;
  line-height: 1.5;
}
.atrium-md :deep(p) {
  margin: 0 0 0.5rem;
}
.atrium-md :deep(p:last-child) {
  margin-bottom: 0;
}
.atrium-md :deep(.atrium-md__h1) {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0.6rem 0 0.4rem;
  letter-spacing: -0.01em;
}
.atrium-md :deep(.atrium-md__h2) {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0.55rem 0 0.35rem;
}
.atrium-md :deep(.atrium-md__h3) {
  font-size: 1rem;
  font-weight: 600;
  margin: 0.45rem 0 0.3rem;
}
.atrium-md :deep(.atrium-md__quote) {
  border-left: 3px solid color-mix(in srgb, var(--ui-primary) 45%, var(--ui-border));
  padding: 0.15rem 0 0.15rem 0.7rem;
  margin: 0.4rem 0;
  color: var(--ui-text-dimmed);
  font-style: italic;
}
.atrium-md :deep(.atrium-md__list) {
  margin: 0.25rem 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.atrium-md :deep(.atrium-md__list li) {
  list-style: disc;
}
.atrium-md :deep(.atrium-md__code-inline) {
  font-family: var(--font-mono, ui-monospace);
  font-size: 0.85em;
  padding: 0.1rem 0.3rem;
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--ui-text-dimmed) 14%, transparent);
}
.atrium-md :deep(.atrium-md__code-block) {
  font-family: var(--font-mono, ui-monospace);
  font-size: 0.82em;
  padding: 0.7rem 0.9rem;
  border-radius: var(--atrium-radius-sm, 0.4rem);
  background: color-mix(in srgb, var(--ui-text-dimmed) 10%, transparent);
  overflow-x: auto;
  margin: 0.4rem 0;
}
.atrium-md :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: color-mix(in srgb, var(--ui-primary) 40%, transparent);
}
.atrium-md :deep(a:hover) {
  text-decoration-color: var(--ui-primary);
}
.atrium-md :deep(.atrium-md__mention) {
  font-weight: 600;
  background: color-mix(in srgb, var(--ui-primary) 12%, transparent);
  border-radius: 0.3rem;
  padding: 0 0.2rem;
  text-decoration: none;
}
.atrium-md :deep(.atrium-md__mention:hover) {
  background: color-mix(in srgb, var(--ui-primary) 22%, transparent);
}
.atrium-md :deep(.atrium-md__mention--broad) {
  background: color-mix(in srgb, var(--ui-color-warning-500, #f97316) 18%, transparent);
  color: var(--ui-color-warning-500, #f97316);
  text-decoration: none;
}
</style>
