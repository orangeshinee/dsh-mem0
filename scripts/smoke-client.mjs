/**
 * Smoke test for the dsh-mem0 browser half (client/client.cjs).
 *
 * Loads the bundle the way the dsh client module loader does — a Node VM with
 * a stub window.__ModuleLoader__ — then drives the settings card's staged form
 * against an in-memory fake of the /api/dsh-mem0/config route and the apply()
 * slot registration against a stub client context. This is NOT a browser test:
 * it proves the bundle parses, registers, and that the form model
 * stages/validates/writes without the GUI. Run with: node scripts/smoke-client.mjs
 */

import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const code = readFileSync(new URL('../client/client.cjs', import.meta.url), 'utf8')

let handoff
const sandbox = {
  window: { __ModuleLoader__: { load: (h) => { handoff = h } } },
  console,
}
vm.createContext(sandbox)
vm.runInContext(code, sandbox)
assert.ok(handoff, 'bundle must call window.__ModuleLoader__.load')
assert.equal(handoff.id, 'dsh-mem0', 'bundle id must be the package name')

/** Minimal observable store matching createSnapshotStore's contract. */
function snapshotStore(init) {
  let state = init
  const listeners = new Set()
  return {
    getSnapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    update: (mutator) => { const draft = structuredClone(state); mutator(draft); state = draft; for (const fn of listeners) fn() },
    set: (next) => { state = next; for (const fn of listeners) fn() },
  }
}

const DEFAULTS = {
  baseUrl: 'http://127.0.0.1:8888',
  apiKey: '',
  authType: 'apiKey',
  defaultUserId: 'HeTony',
  defaultAgentId: 'dsh-agent',
  timeoutMs: 15000,
  announceToAgent: true,
  enabled: true,
}

/**
 * In-memory fake of the host route: holds a raw user section, resolves it over
 * the defaults (schema defaults -> base -> user), and REDACTS the apiKey the
 * way the host's describe({ redactSecrets: true }) view does.
 */
function fakeRouteServer() {
  let user = {}
  const writes = []
  const resolve = () => ({ ...DEFAULTS, ...user })
  const view = () => {
    const value = resolve()
    const { apiKey, ...redacted } = value
    return {
      status: 'ready',
      value: redacted,
      base: { ...DEFAULTS },
      user: { ...user },
      writable: true,
      revision: writes.length + 1,
      apiKeyConfigured: Boolean(apiKey),
    }
  }
  return {
    writes,
    async handle(method, path, body) {
      assert.equal(path, '/api/dsh-mem0/config')
      if (method === 'GET') return { ok: true, status: 200, body: view() }
      if (method !== 'POST') return { ok: false, status: 405, body: { error: 'method not allowed' } }
      const { set = {}, unset = [] } = body ?? {}
      for (const [field, value] of Object.entries(set)) {
        writes.push(['set', field, value])
        user = { ...user, [field]: value }
      }
      for (const field of unset) {
        writes.push(['unset', field])
        const next = { ...user }
        delete next[field]
        user = next
      }
      return { ok: true, status: 200, body: view() }
    },
  }
}

// Global fetch stub the bundle's RouteScope calls (classic-script bundle reads
// the page global, which in the VM sandbox is `fetch` from the sandbox scope).
const server = fakeRouteServer()
sandbox.fetch = async (url, options = {}) => {
  const method = options.method ?? 'GET'
  const body = options.body ? JSON.parse(options.body) : undefined
  const result = await server.handle(method, String(url), body)
  return {
    ok: result.ok,
    status: result.status,
    async json() {
      return result.body
    },
  }
}
// RouteScope also reads `fetch` through the VM realm's global lookup.
vm.runInContext('globalThis.fetch = fetch', sandbox)

const factoryExports = handoff.factory((spec) => {
  switch (spec) {
    case 'react':
      return { createElement: (...args) => args, useState: (v) => [v, () => {}], Fragment: 'Fragment' }
    case 'react/jsx-runtime':
      return { Fragment: 'Fragment', jsx: () => null, jsxs: () => null }
    case '@deepseek-ai/dsh-client-runtime/client':
      return { createSnapshotStore: snapshotStore }
    default:
      throw new Error(`smoke: unexpected require "${spec}"`)
  }
})

assert.equal(typeof factoryExports.apply, 'function', 'bundle must export apply')
assert.deepEqual([...factoryExports.inject], ['slots', 'locale', 'remote'])

// ---------------------------------------------------------------- apply path

const localeRegs = []
const slotRegs = []
const remoteHandlers = []
const stubCtx = {
  effect: (fn) => { const dispose = fn(); return () => dispose?.() },
  locale: {
    register: (ns, dicts) => { localeRegs.push([ns, dicts]); return () => {} },
  },
  remote: {
    $on: (event, handler) => { remoteHandlers.push([event, handler]); return () => {} },
  },
  slots: {
    inject: (_key, factory) => { const dispose = factory(); return () => dispose?.() },
    register: (options, component) => { slotRegs.push([options, component]); return () => {} },
  },
}
factoryExports.apply(stubCtx)

assert.deepEqual(localeRegs.map(([ns]) => ns), ['dsh-mem0'], 'locale dictionaries registered')
assert.equal(remoteHandlers.length, 1, 'settings invalidation subscribed')
assert.equal(remoteHandlers[0][0], 'settings/document-updated')
assert.equal(slotRegs.length, 1, 'one settings card registered')
const [cardOptions, CardComponent] = slotRegs[0]
assert.equal(cardOptions.name, 'settings.plugin.item')
assert.equal(cardOptions.id, 'mem0')
assert.equal(cardOptions.locale, 'dsh-mem0')
assert.equal(typeof cardOptions.inject, 'function')
assert.equal(typeof CardComponent, 'function')

// The scope's initial load is async — wait for the card to become available.
const rawCard = cardOptions.inject()
const card = { ...rawCard }
for (const [name, source] of Object.entries(rawCard.hooks)) {
  const hookName = `use${name[0].toUpperCase()}${name.slice(1)}`
  card[hookName] = (selector) => selector(source.getSnapshot())
}
delete card.hooks

await new Promise((resolve) => setTimeout(resolve, 20))
const state0 = card.useMem0Card((s) => s)
assert.equal(state0.available, true, 'scope reports ready from the route')
assert.equal(state0.writable, true)
assert.equal(state0.dirty, false)
assert.equal(state0.baseUrl.text, 'http://127.0.0.1:8888')
assert.equal(state0.authType.text, 'apiKey')
assert.equal(state0.enabled.checked, true)
assert.equal(state0.apiKey.configured, false, 'blank apiKey reports unconfigured')

// ---------------------------------------------------------------- form model

// Stage an edit and verify the draft + override mark.
card.edit('baseUrl', 'http://192.0.2.1:59888')
const state1 = card.useMem0Card((s) => s)
assert.equal(state1.dirty, true)
assert.equal(state1.baseUrl.text, 'http://192.0.2.1:59888')
assert.equal(state1.baseUrl.overridden, true)

// Typing the same value back is not dirty and shows no override badge.
card.edit('baseUrl', 'http://127.0.0.1:8888')
assert.equal(card.useMem0Card((s) => s).dirty, false, 'same value is not an edit')
assert.equal(card.useMem0Card((s) => s).baseUrl.overridden, false, 'same value shows no override badge')

// A staged clear over a stored override keeps the badge (it will be removed on save).
card.resetField('baseUrl')
const state1b = card.useMem0Card((s) => s)
assert.equal(state1b.baseUrl.text, 'http://127.0.0.1:8888')
assert.equal(state1b.baseUrl.overridden, false, 'clearing an un-stored field shows no badge')
card.discard()

// Invalid number blocks the save.
card.edit('timeoutMs', 'abc')
const state2 = card.useMem0Card((s) => s)
assert.equal(state2.invalid, true)
assert.equal(server.writes.length, 0, 'no writes before a valid save')

// Fix the number, add a bool toggle and a secret; save.
card.edit('timeoutMs', '30000')
card.toggle('announceToAgent', false)
card.edit('apiKey', 'm0sk_smoke')
await card.save()
await new Promise((resolve) => setTimeout(resolve, 20))
const state3 = card.useMem0Card((s) => s)
assert.equal(state3.dirty, false, 'staged edits cleared after a landed save')
assert.deepEqual(
  server.writes,
  [
    ['set', 'timeoutMs', 30000],
    ['set', 'announceToAgent', false],
    ['set', 'apiKey', 'm0sk_smoke'],
  ],
  'save writes exactly the staged edits',
)
assert.equal(state3.apiKey.configured, true, 'saved key reports configured')
assert.equal(state3.timeoutMs.text, '30000', 'read-back reflects the save')

// A blank secret draft writes nothing.
card.edit('apiKey', '   ')
await card.save()
assert.equal(server.writes.length, 3, 'blank secret staged no write')

// Reset-to-default unsets the override.
card.resetField('timeoutMs')
const state4 = card.useMem0Card((s) => s)
assert.equal(state4.timeoutMs.text, '15000', 'reset shows the composition default')
assert.equal(state4.timeoutMs.overridden, true, 'a stored override is marked for clearing')
await card.save()
await new Promise((resolve) => setTimeout(resolve, 20))
assert.deepEqual(server.writes.at(-1), ['unset', 'timeoutMs'], 'reset lands as an unset')
assert.equal(card.useMem0Card((s) => s).timeoutMs.text, '15000', 'cleared field reads the default')

// Discard drops drafts without writing.
card.edit('baseUrl', 'http://example.com')
assert.equal(card.useMem0Card((s) => s).dirty, true)
card.discard()
assert.equal(card.useMem0Card((s) => s).dirty, false)
assert.equal(server.writes.at(-1)[0], 'unset', 'discard performed no write')

// Boolean toggle equal to the current value is not an edit.
card.toggle('enabled', true)
assert.equal(card.useMem0Card((s) => s).dirty, false, 'toggling to the current value is not an edit')

// Render the card body once to catch component-shape errors (stub React).
const rendered = CardComponent({ t: (key) => key, ...card, useMem0Card: card.useMem0Card })
assert.ok(rendered !== null && rendered !== undefined, 'card component renders')

// Settings invalidation reloads the scope.
await remoteHandlers[0][1]('dsh-mem0')
await new Promise((resolve) => setTimeout(resolve, 20))
assert.equal(card.useMem0Card((s) => s).available, true, 'invalidation reloads the route view')

console.log('smoke-client: ok — bundle loads, card registers, route scope stages/saves/discards correctly')
