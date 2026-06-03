/**
 * Typed reader for Atrium-specific runtime config.
 *
 * Mirrors `runtimeConfig.public.atrium` shape from nuxt.config.ts. Returns a
 * frozen plain object — reactivity isn't needed because these values are
 * baked at build (or env) time and never change at runtime.
 *
 * Phase 5+ will layer a per-forum override on top: `useReplyMode(forumId)`
 * resolves to `forumSpace.meta.atrReplyMode ?? config.replyMode`. The hook
 * for that lives in a separate composable so this one stays a pure config
 * reader.
 */
export type AtriumReplyMode = "flat" | "threaded";

export interface AtriumConfig {
  readonly replyMode: AtriumReplyMode;
}

export function useAtriumConfig(): AtriumConfig {
  const runtime = useRuntimeConfig();
  const raw = (runtime.public as { atrium?: Partial<AtriumConfig> }).atrium ?? {};
  return Object.freeze({
    replyMode: raw.replyMode === "threaded" ? "threaded" : "flat",
  });
}
