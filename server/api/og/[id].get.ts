/**
 * GET /api/og/:id
 * GET /api/og/:id.svg
 * GET /api/og/:id.png
 *
 * Serves the Atrium share-card for a thread. Data comes from the
 * `atrium:og-cache` runner — a Y.Map observer that mirrors every thread's
 * label/subtitle/forum/replyCount into Nitro storage. The endpoint
 * formats that into a 1200×630 share card.
 *
 * Output format:
 *   - `.svg` or no suffix → image/svg+xml (always available)
 *   - `.png`              → image/png IF satori + @resvg/resvg-js are
 *                           installed; transparent SVG fallback otherwise.
 *
 * Optional PNG path uses Satori (HTML → SVG) + resvg (SVG → PNG). Install
 * with:  pnpm add satori @resvg/resvg-js
 * The route stays stable either way.
 *
 * Cached for 5 minutes at edge + browser so a popular thread doesn't
 * thrash storage on every unfurl.
 */
import { defineEventHandler, getRouterParam, setHeader, createError } from "h3";
import { useStorage } from "nitropack/runtime/storage";

interface OgMeta {
  label: string;
  subtitle: string;
  forumLabel: string | null;
  threadId: string;
  replyCount: number;
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

function renderSvg(meta: OgMeta): string {
  const hue = hashHue(meta.threadId);
  const accentA = `hsl(${hue}, 80%, 60%)`;
  const accentB = `hsl(${(hue + 60) % 360}, 75%, 55%)`;
  const label = escapeXml(meta.label.slice(0, 110));
  const subtitle = escapeXml(meta.subtitle.slice(0, 140));
  const forum = meta.forumLabel ? `· ${escapeXml(meta.forumLabel)}` : "";
  const replies = meta.replyCount === 1 ? "1 reply" : `${meta.replyCount} replies`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f0a06"/>
      <stop offset="100%" stop-color="#2a1606"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accentA}" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="${accentB}" stop-opacity="0.25"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="980" cy="100" r="200" fill="url(#accent)"/>
  <circle cx="120" cy="540" r="240" fill="${accentB}" fill-opacity="0.10"/>
  <text x="80" y="120" font-family="Inter, system-ui, sans-serif" font-size="28" fill="${accentA}" font-weight="600">Atrium · realtime forums ${forum}</text>
  <foreignObject x="80" y="170" width="1040" height="320">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#fff;font-family:Inter,system-ui,sans-serif;font-size:62px;font-weight:700;line-height:1.08;letter-spacing:-0.02em;text-shadow:0 2px 12px rgba(0,0,0,0.4);">${label}</div>
  </foreignObject>
  <foreignObject x="80" y="500" width="1040" height="80">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#d1d5db;font-family:Inter,system-ui,sans-serif;font-size:24px;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${subtitle}</div>
  </foreignObject>
  <text x="1120" y="600" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="22" fill="${accentA}" font-weight="600">${replies}</text>
</svg>`;
}

function renderFallback(id: string): OgMeta {
  return {
    label: "Atrium thread",
    subtitle: "This thread isn't ready to share yet — its data hasn't synced through the cache.",
    forumLabel: null,
    threadId: id,
    replyCount: 0,
  };
}

// Try-import satori + resvg lazily. Result is cached so a missing package
// doesn't cost a new try-import on every request.
type PngRenderer = (meta: OgMeta) => Promise<Buffer | null>;
let pngRenderer: PngRenderer | null | undefined;

async function loadPngRenderer(): Promise<PngRenderer | null> {
  if (pngRenderer !== undefined) return pngRenderer;
  try {
    const [satoriMod, resvgMod] = await Promise.all([
      import("satori" as string).catch(() => null),
      import("@resvg/resvg-js" as string).catch(() => null),
    ]);
    if (!satoriMod || !resvgMod) {
      console.log("[atrium:og] satori / @resvg/resvg-js not installed — PNG path disabled, serving SVG");
      pngRenderer = null;
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const satori = (satoriMod as any).default ?? satoriMod;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Resvg } = resvgMod as any;

    pngRenderer = async (meta: OgMeta) => {
      const hue = hashHue(meta.threadId);
      const accentA = `hsl(${hue}, 80%, 60%)`;
      const accentB = `hsl(${(hue + 60) % 360}, 75%, 55%)`;
      const replies = meta.replyCount === 1 ? "1 reply" : `${meta.replyCount} replies`;
      const tree = {
        type: "div",
        props: {
          style: {
            width: "1200px",
            height: "630px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "80px",
            backgroundImage: `linear-gradient(135deg, #0f0a06 0%, #2a1606 100%)`,
            color: "#fff",
            fontFamily: "Inter, system-ui, sans-serif",
            position: "relative",
          },
          children: [
            {
              type: "div",
              props: {
                style: { color: accentA, fontSize: "28px", fontWeight: 600 },
                children: `Atrium · realtime forums${meta.forumLabel ? " · " + meta.forumLabel : ""}`,
              },
            },
            {
              type: "div",
              props: {
                style: {
                  fontSize: "62px",
                  fontWeight: 700,
                  lineHeight: 1.08,
                  letterSpacing: "-0.02em",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                },
                children: meta.label,
              },
            },
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  color: "#d1d5db",
                  fontSize: "24px",
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        maxWidth: "850px",
                      },
                      children: meta.subtitle || "",
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: { color: accentB, fontSize: "22px", fontWeight: 600 },
                      children: replies,
                    },
                  },
                ],
              },
            },
          ],
        },
      };
      const svg = await satori(tree as never, { width: 1200, height: 630, fonts: [] });
      const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
      const png = resvg.render();
      return Buffer.from(png.asPng());
    };
    console.log("[atrium:og] Satori + resvg detected — serving PNG share cards");
    return pngRenderer;
  }
  catch (e) {
    console.warn("[atrium:og] PNG renderer init failed:", e);
    pngRenderer = null;
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, "id");
  if (!raw) {
    throw createError({ statusCode: 400, message: "thread id required" });
  }
  const extMatch = raw.match(/\.(svg|png)$/i);
  const requestedExt = extMatch?.[1]?.toLowerCase() as "svg" | "png" | undefined;
  const id = raw.replace(/\.(svg|png)$/i, "");

  const storage = useStorage();
  const meta = (await storage.getItem<OgMeta>(`atrium:og:${id}`)) ?? renderFallback(id);

  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  if (requestedExt === "png") {
    const render = await loadPngRenderer();
    if (render) {
      try {
        const buf = await render(meta);
        if (buf) {
          setHeader(event, "Content-Type", "image/png");
          return buf;
        }
      }
      catch (e) {
        console.warn("[atrium:og] PNG render failed, falling back to SVG:", e);
      }
    }
    // PNG was asked but not available — fall through to SVG.
  }
  setHeader(event, "Content-Type", "image/svg+xml; charset=utf-8");
  return renderSvg(meta);
});
