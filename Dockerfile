# syntax=docker/dockerfile:1
#
# Standalone production image for the Nuxt app. Builds the Nitro server bundle
# and runs it with plain Node — no pnpm / devDependencies in the final image.
#
#   docker build -t atrium:latest .
#   docker run --rm -p 3401:3000 \
#     -e NUXT_PUBLIC_ABRACADABRA_URL=https://coop.cou.sh atrium:latest
#
# Atrium also runs a Nitro RPC v1 service runner — pass the service keypair via
# NUXT_ABRACADABRA_SERVICE_PUBLIC_KEY / NUXT_ABRACADABRA_SERVICE_PRIVATE_KEY.
# `docker-compose.yml` wires that up against a dedicated forum server.

# ---- Builder ----------------------------------------------------------------
FROM node:22-bookworm AS builder
WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN corepack enable

# node-gyp toolchain for any transitive native dependency.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ sqlite3 libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Dependency layer — cached until the manifests change. The lockfile glob keeps
# this Dockerfile working for repos that have not committed a pnpm-lock.yaml.
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile || pnpm install

# App sources + production build.
COPY . .
RUN pnpm build

# ---- Runner -----------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Non-root runtime user.
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nuxt

# The Nitro output bundle is self-contained (deps inlined) — copy only it.
COPY --from=builder --chown=nuxt:nodejs /app/.output ./.output

USER nuxt
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
