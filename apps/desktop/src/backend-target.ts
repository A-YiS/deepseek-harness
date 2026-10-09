/**
 * Backend targets: the Host one application window drives.
 *
 * The shell serves its page from its own `dsh-app://app` origin and proxies
 * every other request to one upstream, so pointing the packaged UI at another
 * Harness means replacing three values — the upstream URL, the authority-bound
 * cookie that upstream admits, and the boot injections its page would have
 * carried. A remote target reaches the shell over an SSH local forward the
 * remote-connect plugin already owns, which is why every target must be a
 * loopback origin: the cookie is authority-bound, and the WebSocket credential
 * rewrite accepts the same loopback authorities.
 */

import type { DesktopBackendRequest, DesktopBackendTarget } from './ipc.ts'
import { authenticateWebHost } from './web-document.ts'

/** Default route the companion plugin serves to mint a tunneled session. */
export const DEFAULT_AUTHORIZE_PATH = '/remote-connect/authorize'

/** Default route the companion plugin serves to hand over boot injections. */
export const DEFAULT_BOOT_PATH = '/remote-connect/boot'

/** Hostnames admitted as a target origin. */
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * Validate a renderer-requested target origin.
 *
 * Only loopback HTTP origins are admitted: the target arrives from a product
 * page, and both the session cookie and the WebSocket credential rewrite are
 * bound to the authority the tunnel publishes on this machine.
 * @param url - requested origin.
 * @returns the parsed origin.
 * @throws when the origin is not a loopback HTTP origin.
 */
export function parseTargetOrigin(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('desktop backend: the target URL is not an absolute origin')
  }
  if (parsed.protocol !== 'http:') throw new Error('desktop backend: the target must use http')
  if (!LOOPBACK_HOSTNAMES.has(parsed.hostname)) {
    throw new Error('desktop backend: the target must be a loopback origin')
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('desktop backend: the target must not include credentials')
  }
  return parsed
}
/**
 * Resolve one route path against a target origin.
 * @param origin - validated target origin.
 * @param path - absolute path on the target.
 * @returns the absolute route URL.
 */
export function targetRoute(origin: URL, path: string): URL {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('desktop backend: a target path must be absolute')
  }
  const route = new URL(path, origin)
  if (route.origin !== origin.origin) throw new Error('desktop backend: a target path must stay on the target')
  return route
}

/**
 * Decode the boot handover body.
 * @param value - parsed JSON body.
 * @returns the injection table and the Host version it reported.
 * @throws when the body carries no injection table.
 */
function readBootPayload(value: unknown): { injections: readonly unknown[]; version: string | null } {
  if (typeof value !== 'object' || value === null) throw new Error('desktop backend: the boot handover is not an object')
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.injections)) throw new Error('desktop backend: the boot handover carries no injections')
  return { injections: record.injections, version: typeof record.version === 'string' ? record.version : null }
}

/**
 * Attach to a remote Host: mint the cookie the tunnel authority admits, then
 * collect the boot injections that Host would have served its own page.
 * @param request - renderer-supplied target description.
 * @returns the ready-to-use target.
 * @throws when the target is not loopback, refuses the handshake, or does not
 * serve the boot route (a remote without the companion plugin).
 */
export async function attachRemoteTarget(request: DesktopBackendRequest): Promise<DesktopBackendTarget> {
  const origin = parseTargetOrigin(request.url)
  const cookie = await authenticateWebHost(targetRoute(origin, request.authorizePath ?? DEFAULT_AUTHORIZE_PATH).href)
  const response = await fetch(targetRoute(origin, request.bootPath ?? DEFAULT_BOOT_PATH), {
    headers: { cookie },
    cache: 'no-store',
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`desktop backend: the target refused the boot handover (HTTP ${String(response.status)})`)
  }
  const payload = readBootPayload(JSON.parse(body))
  return {
    url: origin.origin,
    cookie,
    injections: payload.injections,
    version: payload.version,
    ...(request.label === undefined ? {} : { label: request.label }),
  }
}
