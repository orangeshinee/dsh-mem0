/**
 * Load test: run the plugin's apply() against a minimal mock host context
 * and verify the expected tools + prompt section are registered without
 * throwing. No network and no real cordis runtime needed.
 */
import { apply } from '../lib/index.js'

const registeredTools = []
const sections = []
const registeredRoutes = []
let effectsActive = 0

/** Stub webserver the injected scope hands out for `get('webServer')`. */
const webServerStub = {
  register: (route) => {
    registeredRoutes.push(`${route.kind} ${route.path}`)
    return () => { const i = registeredRoutes.lastIndexOf(`${route.kind} ${route.path}`); if (i >= 0) registeredRoutes.splice(i, 1) }
  },
}

const ctx = {
  fiber: { state: 'active' },
  get: () => undefined,
  inject: (deps, cb) =>
    cb({
      get: (name) => (name === 'webServer' ? webServerStub : undefined),
      settings: {
        register: (ns, schema, opts) => ({
          get: () => ({ baseUrl: 'http://x', apiKey: '', authType: 'apiKey', defaultUserId: 'Tony', defaultAgentId: 'dsh-agent', timeoutMs: 1000, announceToAgent: true, enabled: true }),
          watch: () => () => {},
        }),
      },
      effect: (fn) => { const d = fn(); return () => { if (typeof d === 'function') d() } },
    }),
  effect: (fn, label) => {
    const disposer = fn()
    effectsActive += 1
    return () => { if (typeof disposer === 'function') disposer(); effectsActive -= 1 }
  },
  systemPrompt: {
    section: (spec) => {
      sections.push(spec)
      return () => { const i = sections.lastIndexOf(spec); if (i >= 0) sections.splice(i, 1) }
    },
  },
  tools: {
    register: (tool) => {
      registeredTools.push(tool.name)
      return () => { const i = registeredTools.lastIndexOf(tool.name); if (i >= 0) registeredTools.splice(i, 1) }
    },
  },
}

apply(ctx, { baseUrl: 'http://x', apiKey: '', authType: 'apiKey', defaultUserId: 'Tony', defaultAgentId: 'dsh-agent', timeoutMs: 1000, announceToAgent: true, enabled: true })

const expected = ['mem0_add', 'mem0_search', 'mem0_get', 'mem0_update', 'mem0_delete', 'mem0_history', 'mem0_reset', 'mem0_status']
const missing = expected.filter((n) => !registeredTools.includes(n))
console.log('registered tools:', registeredTools.join(', '))
console.log('prompt sections:', sections.map((s) => `${s.name}@${s.order}`).join(', '))
console.log('config routes:', registeredRoutes.join(', '))
console.log('effects active:', effectsActive)
if (missing.length > 0) { console.error('MISSING:', missing.join(', ')); process.exit(1) }
if (sections.length !== 1 || sections[0].name !== 'plugin:dsh-mem0') { console.error('section mismatch'); process.exit(1) }
if (registeredRoutes.length !== 1 || registeredRoutes[0] !== 'exact /api/dsh-mem0/config') { console.error('route mismatch'); process.exit(1) }
console.log('OK: all 8 tools + announcement section registered')

// --- volatile reference shape -----------------------------------------------
// A `.volatile()` schema field does not hand apply() a bare value: schemastery
// types it `Volatile<T>`, a reference exposing get(). Passing plain strings
// here (as the block above does) hides that entirely, which is how
// `(config.baseUrl ?? '').replace` shipped and threw "replace is not a
// function" at the first real tool call. Exercise the real shape.
const { resolveConfig } = await import('../lib/config.js')

const ref = (value) => ({ get: () => value })
const resolved = resolveConfig({
  baseUrl: ref('http://mem0.internal:8888'),
  apiKey: ref('m0sk_secret'),
  authType: ref('jwt'),
  defaultUserId: ref('Tony'),
  defaultAgentId: ref('dsh-agent'),
  timeoutMs: ref(2500),
  announceToAgent: ref(false),
  enabled: ref(true),
})
for (const [key, want] of Object.entries({
  baseUrl: 'http://mem0.internal:8888',
  apiKey: 'm0sk_secret',
  authType: 'jwt',
  defaultUserId: 'Tony',
  defaultAgentId: 'dsh-agent',
  timeoutMs: 2500,
  announceToAgent: false,
  enabled: true,
})) {
  if (resolved[key] !== want) {
    console.error(`volatile unwrap: ${key} = ${JSON.stringify(resolved[key])}, want ${JSON.stringify(want)}`)
    process.exit(1)
  }
}
// A reference resolving to an absent value must still fall back to the default,
// and plain values must keep working (hand-built contexts pass them directly).
if (resolved.baseUrl !== 'http://mem0.internal:8888') { console.error('volatile baseUrl not unwrapped'); process.exit(1) }
const fallback = resolveConfig({ baseUrl: ref(undefined), timeoutMs: 15000, enabled: true })
if (fallback.baseUrl !== 'http://127.0.0.1:8888') { console.error('undefined ref did not fall back'); process.exit(1) }
const plain = resolveConfig({ baseUrl: 'http://plain:1234', timeoutMs: 15000, enabled: true })
if (plain.baseUrl !== 'http://plain:1234') { console.error('plain value broke'); process.exit(1) }
console.log('OK: volatile config references unwrap (and plain values still pass through)')
