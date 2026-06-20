# Running Atrium with Docker

Atrium is the Discord-style forum/community client. It is the one app that runs a
**Nitro RPC v1 service runner**, so its compose pre-provisions a service-role
account on the bundled server.

1. **`docker-compose.yml`** — forum **plus its own dedicated server** (SQLite
   default, Postgres optional) + the service account wiring.
2. **`Dockerfile`** — just the Nuxt app, pointed at any external hub.

---

## 1. Full stack (compose)

### Prerequisite — build the server image once

```bash
cd ../abracadabra-rs && docker build -t abracadabra:latest .
```

### Start (SQLite — the default)

```bash
cp .env.docker.example .env     # optional: change ports / secrets / keys
docker compose up -d --build
open http://localhost:3401       # admin login: owner / owner
```

Forum posture: **guests can read** (anonymous = observer), **signed-in members
post** (editor), and only admins / the service runner create top-level forums.
Uploads are media-sized (200 MB) and notifications fan out to all members.

### Postgres instead of SQLite

Uncomment `ABRA_DATABASE_URL` in `.env`, then:

```bash
docker compose --profile postgres up -d --build
```

### Stop / reset

```bash
docker compose down            # stop, keep data
docker compose down -v         # stop AND delete db + uploads volumes
```

---

## The RPC v1 service account

Atrium's Nitro server authenticates to the Abracadabra server as a dedicated,
**service-role** account so it can host RPC method handlers. Two halves must
agree:

| Half | Where | Var |
|---|---|---|
| Public key | `docker/abracadabra.toml` → `[[users.system_users]].public_key` | — |
| Public + private key | `.env` | `ATRIUM_SERVICE_PUBLIC_KEY`, `ATRIUM_SERVICE_PRIVATE_KEY` |

A **DEV-ONLY** keypair ships as the default so the stack works out of the box.
**Regenerate it for any real deployment:**

```bash
node -e 'const c=require("crypto");const{publicKey,privateKey}=c.generateKeyPairSync("ed25519");
const b=x=>Buffer.from(x).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
console.log("ATRIUM_SERVICE_PUBLIC_KEY="+b(publicKey.export({type:"spki",format:"der"}).subarray(-32)));
console.log("ATRIUM_SERVICE_PRIVATE_KEY="+b(privateKey.export({type:"pkcs8",format:"der"}).subarray(-32)));'
```

Put the public key into **both** `docker/abracadabra.toml` and `.env`, and the
private key into `.env`. (Wipe the server volume — `docker compose down -v` — if
you rotate keys after first boot, so the old account isn't left behind.)

---

## 2. Standalone app (Dockerfile)

```bash
docker build -t atrium:latest .
docker run --rm -p 3401:3000 \
  -e NUXT_PUBLIC_ABRACADABRA_URL=https://your-forum-server.example.com \
  -e NUXT_ABRACADABRA_SERVICE_PUBLIC_KEY=... \
  -e NUXT_ABRACADABRA_SERVICE_PRIVATE_KEY=... \
  atrium:latest
```

The target server must already have that public key registered as a service
account. Omit the service keys and the runner auto-bootstraps a regular
(non-service) identity instead, if the server allows open registration.

---

## Ports

| Service | In-container | Host (default) | Override |
|---|---|---|---|
| Atrium (Nuxt) | 3000 | 3401 | `APP_PORT` |
| Abracadabra server | 3000 | 4401 | `ABRA_PORT` |
| Postgres (profile) | 5432 | — | — |

The app reaches the server at `http://abra.localhost:${ABRA_PORT}` — loopback in
the browser, host-gateway inside the container (one URL, no proxy).

## Optional: voice mesh TURN

Set `ATRIUM_TURN_URL` / `ATRIUM_TURN_USERNAME` / `ATRIUM_TURN_CREDENTIAL` in
`.env` to relay WebRTC voice for peers that can't reach each other via STUN.

## Production notes

- Rotate `ABRA_AUTH_JWT_SECRET`, the admin password, **and the service keypair**.
- The `atrium-service` password in `docker/abracadabra.toml` is dev-only — change it.
- Replace `ABRA_SERVER_CORS_ALLOW_ANY=true` with a CORS allowlist + TLS.
- The schema bundle dir is empty in Docker (the generated schemas live in the
  `abracadabra-ts` sibling repo, not in this image).
