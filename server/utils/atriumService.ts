/**
 * Holder for the service-role `AbracadabraClient`.
 *
 * `ServerRunnerContext` (which carries the client) only exists inside a runner's
 * `start()`, and @abraca/nuxt exports no accessor for it — so a runner stashes it
 * here and Nitro routes read it back. `server/plugins/atrium-service-handle.ts`
 * does the stashing.
 *
 * Everything in here runs as the **service account** (root admin). Never expose a
 * route that forwards caller-supplied parameters into it without re-deriving the
 * caller's identity from their own token first — see
 * `server/api/_atrium/dm/[pubkey].post.ts`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AbracadabraClient isn't exported as a server-side type
export type ServiceClient = any;

let _client: ServiceClient | null = null;

export function setServiceClient(client: ServiceClient): void {
  _client = client;
}

export function getServiceClient(): ServiceClient | null {
  return _client;
}
