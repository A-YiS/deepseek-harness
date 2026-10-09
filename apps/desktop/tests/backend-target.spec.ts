import { afterEach, expect, it, vi } from 'vitest'
import { attachRemoteTarget, parseTargetOrigin, targetRoute } from '../src/backend-target.ts'

afterEach(() => { vi.unstubAllGlobals() })

it('admits only loopback http targets', () => {
  expect(parseTargetOrigin('http://127.0.0.1:50489').origin).toBe('http://127.0.0.1:50489')
  expect(parseTargetOrigin('http://localhost:3080/').hostname).toBe('localhost')
  expect(parseTargetOrigin('http://[::1]:3080').hostname).toBe('[::1]')
  expect(() => parseTargetOrigin('https://127.0.0.1:50489')).toThrow(/must use http/)
  expect(() => parseTargetOrigin('http://192.168.124.161:3080')).toThrow(/loopback/)
  expect(() => parseTargetOrigin('http://user:pass@127.0.0.1:3080')).toThrow(/credentials/)
  expect(() => parseTargetOrigin('not a url')).toThrow(/absolute origin/)
})

it('resolves only absolute target paths', () => {
  expect(targetRoute(new URL('http://127.0.0.1:1'), '/remote-connect/boot').href).toBe('http://127.0.0.1:1/remote-connect/boot')
  expect(() => targetRoute(new URL('http://127.0.0.1:1'), 'remote-connect/boot')).toThrow(/absolute/)
  expect(() => targetRoute(new URL('http://127.0.0.1:1'), '//192.168.124.161/boot')).toThrow(/absolute/)
})

/** Answer the authorize exchange, then the boot handover. */
function stubHandshake(options: { readonly boot?: () => Response } = {}): string[] {
  const seen: string[] = []
  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.href
    seen.push(`${init?.headers === undefined ? '' : JSON.stringify(init.headers)} ${url}`)
    if (url.endsWith('/remote-connect/authorize')) {
      return Promise.resolve(new Response(null, {
        status: 303,
        headers: { 'set-cookie': 'dsh-auth-x=v1.body.sig; Path=/; HttpOnly' },
      }))
    }
    return Promise.resolve(options.boot?.() ?? new Response(JSON.stringify({
      ok: true,
      version: '0.2.0-rc.2',
      injections: [{ kind: 'global', name: '__DSH_BOOT__', value: { rev: 'r' } }],
    }), { status: 200 }))
  })
  return seen
}

it('mints the target cookie and collects its boot injections', async () => {
  const seen = stubHandshake()
  const target = await attachRemoteTarget({ url: 'http://127.0.0.1:50489/', label: '局域网服务器' })
  expect(target).toEqual({
    url: 'http://127.0.0.1:50489',
    cookie: 'dsh-auth-x=v1.body.sig',
    injections: [{ kind: 'global', name: '__DSH_BOOT__', value: { rev: 'r' } }],
    label: '局域网服务器',
    version: '0.2.0-rc.2',
  })
  expect(seen[0]).toBe(' http://127.0.0.1:50489/remote-connect/authorize')
  expect(seen[1]).toContain('"cookie":"dsh-auth-x=v1.body.sig"')
  expect(seen[1]).toContain('http://127.0.0.1:50489/remote-connect/boot')
})

it('refuses a target that does not serve the boot handover', async () => {
  stubHandshake({ boot: () => new Response('not found', { status: 404 }) })
  await expect(attachRemoteTarget({ url: 'http://127.0.0.1:50489' })).rejects.toThrow(/boot handover \(HTTP 404\)/)
})

it('refuses a boot body without an injection table', async () => {
  stubHandshake({ boot: () => new Response(JSON.stringify({ ok: true }), { status: 200 }) })
  await expect(attachRemoteTarget({ url: 'http://127.0.0.1:50489' })).rejects.toThrow(/no injections/)
})
