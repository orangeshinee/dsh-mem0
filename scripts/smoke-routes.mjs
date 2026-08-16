/**
 * Smoke test for the host /api/dsh-mem0/config route (src/settings-routes.ts,
 * built to lib/). Drives the route handler with a fake settings service and
 * fake req/res: redaction, field allowlist, loopback fence, set/unset writes.
 * Run with: node scripts/smoke-routes.mjs
 */

import assert from 'node:assert/strict'

const { makeSettingsRoutes, CONFIG_ROUTE } = await import('../lib/settings-routes.js')

/** A fake settings service exposing just what the route touches. */
function fakeSettings(initialUser = { baseUrl: 'http://***REMOVED***:59888', apiKey: 'm0sk_secret' }) {
  const calls = []
  const state = { user: { ...initialUser } }
  return {
    calls,
    writable: true,
    describe({ redactSecrets }) {
      assert.equal(redactSecrets, true, 'route must always redact secrets')
      const user = state.user
      const base = { baseUrl: 'http://127.0.0.1:8888', defaultUserId: 'HeTony', authType: 'apiKey' }
      const value = { ...base, ...user }
      if (redactSecrets) {
        const valueLayer = { ...value }
        const baseLayer = { ...base }
        const userLayer = { ...user }
        for (const layer of [valueLayer, baseLayer, userLayer]) delete layer.apiKey
        return [
          {
            ns: 'dsh-mem0',
            value: valueLayer,
            base: baseLayer,
            user: userLayer,
            writable: true,
            revision: 3,
            secrets: [{ path: ['apiKey'], set: Boolean(initialUser.apiKey) }],
          },
        ]
      }
      return []
    },
    async update(ns, patch) {
      calls.push(['update', String(ns), patch])
      Object.assign(state.user, patch)
    },
    async mutate(ns, ops) {
      calls.push(['mutate', String(ns), ops])
      for (const op of ops) if (op.op === 'unset') delete state.user[op.path[0]]
    },
  }
}

/** Loopback same-origin req with a captured response. */
function fakeExchange(settings, { method = 'GET', remote = '127.0.0.1', body, origin = 'http://127.0.0.1:3080' } = {}) {
  const req = {
    method,
    socket: { remoteAddress: remote },
    headers: {
      host: '127.0.0.1:3080',
      origin,
      'sec-fetch-site': 'same-origin',
    },
    [Symbol.asyncIterator]() {
      const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
      let i = 0
      return {
        next: async () => (i < chunks.length ? { value: chunks[i++], done: false } : { value: undefined, done: true }),
      }
    },
  }
  let status = 0
  let payload = ''
  const res = {
    writeHead(code) { status = code },
    end(text) { payload = text },
  }
  const route = makeSettingsRoutes({ get: (name) => (name === 'settings' ? settings : undefined) })[0]
  return { route, run: () => route.handler(req, res).then(() => ({ status, payload: JSON.parse(payload || 'null') })) }
}

// ---------------------------------------------------------------- GET

const settings = fakeSettings()
{
  const { run } = fakeExchange(settings)
  const { status, payload } = await run()
  assert.equal(status, 200)
  assert.equal(payload.status, 'ready')
  assert.equal(payload.apiKeyConfigured, true)
  assert.equal(payload.value.baseUrl, 'http://***REMOVED***:59888')
  assert.equal('apiKey' in payload.value, false, 'apiKey literal is redacted')
  assert.equal('apiKey' in payload.user, false, 'apiKey literal is redacted from the user layer')
  assert.equal(payload.writable, true)
  assert.equal(payload.revision, 3)
}

// GET with no key -> apiKeyConfigured false.
{
  const empty = fakeSettings({ baseUrl: 'http://x' })
  const { run } = fakeExchange(empty)
  const { payload } = await run()
  assert.equal(payload.apiKeyConfigured, false)
}

// ---------------------------------------------------------------- POST

// set + unset write through the settings service and echo the new view.
{
  const { run } = fakeExchange(settings, { method: 'POST', body: { set: { timeoutMs: 30000, announceToAgent: false }, unset: ['baseUrl'] } })
  const { status, payload } = await run()
  assert.equal(status, 200)
  assert.deepEqual(settings.calls[0], ['update', 'dsh-mem0', { timeoutMs: 30000, announceToAgent: false }])
  assert.deepEqual(settings.calls[1], ['mutate', 'dsh-mem0', [{ op: 'unset', path: ['baseUrl'] }]])
  assert.equal(payload.value.timeoutMs, 30000)
  assert.equal(payload.value.baseUrl, 'http://127.0.0.1:8888', 'unset re-inherits the composition base')
}

// Unknown fields are rejected before any write.
{
  const s2 = fakeSettings()
  const { run } = fakeExchange(s2, { method: 'POST', body: { set: { evil: 1 } } })
  const { status, payload } = await run()
  assert.equal(status, 400)
  assert.match(payload.error, /unknown config field/)
  assert.equal(s2.calls.length, 0)
}

// Empty body -> no-op 200.
{
  const s3 = fakeSettings()
  const { run } = fakeExchange(s3, { method: 'POST', body: {} })
  const { status } = await run()
  assert.equal(status, 200)
  assert.equal(s3.calls.length, 0)
}

// ---------------------------------------------------------------- fence

// Non-loopback is refused.
{
  const { run } = fakeExchange(settings, { remote: '192.168.1.10' })
  const { status, payload } = await run()
  assert.equal(status, 403)
  assert.match(payload.error, /loopback/)
}

// Cross-site origin is refused.
{
  const { run } = fakeExchange(settings, { origin: 'http://evil.example' })
  const { status } = await run()
  assert.equal(status, 403)
}

// Method not allowed.
{
  const { run } = fakeExchange(settings, { method: 'PUT' })
  const { status } = await run()
  assert.equal(status, 405)
}

// Missing settings service -> GET yields unavailable 200; POST is refused 503.
{
  const { route, run, makeReq } = await (async () => {
    const r = makeSettingsRoutes({ get: () => undefined })[0]
    const makeReq = (method) => ({
      method,
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' },
      [Symbol.asyncIterator]() {
        const chunks = method === 'POST' ? [Buffer.from('{}')] : []
        let i = 0
        return {
          next: async () => (i < chunks.length ? { value: chunks[i++], done: false } : { value: undefined, done: true }),
        }
      },
    })
    const exchange = async (req) => {
      let status = 0
      let payload = ''
      const res = { writeHead(c) { status = c }, end(t) { payload = t } }
      await r.handler(req, res)
      return { status, payload: JSON.parse(payload || 'null') }
    }
    return { route: r, run: exchange, makeReq }
  })()
  assert.equal(route.path, CONFIG_ROUTE)
  assert.equal((await run(makeReq('GET'))).status, 200)
  const post = await run(makeReq('POST'))
  assert.equal(post.status, 503)
  assert.match(post.payload.error, /settings service is absent/)
}

console.log('smoke-routes: ok — GET redaction, POST set/unset, allowlist, fence, and 405/503 paths behave')
