/**
 * Smoke test for the dsh-mem0 browser half (client/client.js).
 *
 * Loads the bundle the way the dsh client module loader does — a Node VM with
 * a stub window.__ModuleLoader__ — then drives the settings card's staged form
 * against a fake settings scope and the apply() slot registration against a
 * stub client context. This is NOT a browser test: it proves the bundle
 * parses, registers, and that the form model stages/validates/writes without
 * the GUI. Run with: node scripts/smoke-client.mjs
 */

import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const code = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')

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

/** Fake settings scope: resolves like the Host transport, records writes. */
function fakeScope(initial) {
  const writes = []
  let snapshot = {
    status: 'ready',
    value: { ...initial },
    base: { ...initial },
    user: {},
    revision: 1,
    writable: true,
    mode: 'host',
  }
  const listeners = new Set()
  const publish = () => { for (const fn of listeners) fn() }
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    async set(field, value) {
      writes.push(['set', field, value])
      snapshot = { ...snapshot, user: { ...snapshot.user, [field]: value }, value: { ...snapshot.value, [field]: value }, revision: snapshot.revision + 1 }
      publish()
    },
    async unset(field) {
      writes.push(['unset', field])
      const user = { ...snapshot.user }
      delete user[field]
      const value = { ...snapshot.value }
      if (field in snapshot.base) value[field] = snapshot.base[field]
      else delete value[field]
      snapshot = { ...snapshot, user, value, revision: snapshot.revision + 1 }
      publish()
    },
    writes,
  }
}

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
assert.deepEqual([...factoryExports.inject], ['slots', 'locale', 'connection', 'remote', 'settingsScope'])

// ---------------------------------------------------------------- form model

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

const scope = fakeScope(DEFAULTS)

// Reach the controller through the apply path with a stub client context.
const localeRegs = []
const slotRegs = []
const stubCtx = {
  effect: (fn) => { const dispose = fn(); return () => dispose?.() },
  locale: {
    register: (ns, dicts) => { localeRegs.push([ns, dicts]); return () => {} },
  },
  settingsScope: {
    bind: (spec) => { assert.equal(spec.namespace, 'dsh-mem0'); return scope },
  },
  slots: {
    inject: (_key, factory) => { const dispose = factory(); return () => dispose?.() },
    register: (options, component) => { slotRegs.push([options, component]); return () => {} },
  },
}
factoryExports.apply(stubCtx)

assert.deepEqual(localeRegs.map(([ns]) => ns), ['dsh-mem0'], 'locale dictionaries registered')
assert.equal(slotRegs.length, 1, 'one settings card registered')
const [cardOptions, CardComponent] = slotRegs[0]
assert.equal(cardOptions.name, 'settings.plugin.item')
assert.equal(cardOptions.id, 'mem0')
assert.equal(cardOptions.locale, 'dsh-mem0')
assert.equal(typeof cardOptions.inject, 'function')
assert.equal(typeof CardComponent, 'function')

const rawCard = cardOptions.inject()
// Mimic the slot renderer's bindInjectHooks: `hooks: { mem0Card: store }`
// becomes `useMem0Card(selector)` on the component's injected props.
const card = { ...rawCard }
for (const [name, source] of Object.entries(rawCard.hooks)) {
  const hookName = `use${name[0].toUpperCase()}${name.slice(1)}`
  card[hookName] = (selector) => selector(source.getSnapshot())
}
delete card.hooks
const state0 = card.useMem0Card((s) => s)
assert.equal(state0.available, true)
assert.equal(state0.writable, true)
assert.equal(state0.dirty, false)
assert.equal(state0.baseUrl.text, 'http://127.0.0.1:8888')
assert.equal(state0.authType.text, 'apiKey')
assert.equal(state0.enabled.checked, true)
assert.equal(state0.apiKey.configured, false, 'blank apiKey reports unconfigured')

// Stage an edit and verify the draft + override mark.
card.edit('baseUrl', 'http://***REMOVED***:59888')
const state1 = card.useMem0Card((s) => s)
assert.equal(state1.dirty, true)
assert.equal(state1.baseUrl.text, 'http://***REMOVED***:59888')
assert.equal(state1.baseUrl.overridden, true)

// Typing the same value back is not dirty.
card.edit('baseUrl', 'http://127.0.0.1:8888')
assert.equal(card.useMem0Card((s) => s).dirty, false, 'same value is not an edit')

// Invalid number blocks the save.
card.edit('timeoutMs', 'abc')
const state2 = card.useMem0Card((s) => s)
assert.equal(state2.invalid, true)
assert.equal(scope.writes.length, 0, 'no writes before a valid save')

// Fix the number, add a bool toggle and a secret; save.
card.edit('timeoutMs', '30000')
card.toggle('announceToAgent', false)
card.edit('apiKey', 'm0sk_smoke')
await card.save()
const state3 = card.useMem0Card((s) => s)
assert.equal(state3.dirty, false, 'staged edits cleared after a landed save')
assert.deepEqual(
  scope.writes,
  [
    ['set', 'timeoutMs', 30000],
    ['set', 'announceToAgent', false],
    ['set', 'apiKey', 'm0sk_smoke'],
  ],
  'save writes exactly the staged edits',
)
assert.equal(state3.apiKey.configured, true, 'saved key reports configured')

// A blank secret draft writes nothing.
card.edit('apiKey', '   ')
await card.save()
assert.deepEqual(scope.writes.map((w) => w[1]), ['timeoutMs', 'announceToAgent', 'apiKey'], 'blank secret staged no write')

// Reset-to-default unsets the override.
card.resetField('timeoutMs')
const state4 = card.useMem0Card((s) => s)
assert.equal(state4.timeoutMs.text, '15000', 'reset shows the composition default')
assert.equal(state4.timeoutMs.overridden, true, 'a stored override is marked for clearing')
await card.save()
assert.deepEqual(scope.writes.at(-1), ['unset', 'timeoutMs'], 'reset lands as an unset')

// Discard drops drafts without writing.
card.edit('baseUrl', 'http://example.com')
assert.equal(card.useMem0Card((s) => s).dirty, true)
card.discard()
assert.equal(card.useMem0Card((s) => s).dirty, false)
assert.equal(scope.writes.at(-1)[0], 'unset', 'discard performed no write')

// Boolean toggle equal to the current value is not an edit.
card.toggle('enabled', true)
assert.equal(card.useMem0Card((s) => s).dirty, false, 'toggling to the current value is not an edit')

// Render the card body once to catch component-shape errors (stub React).
const rendered = CardComponent({ t: (key) => key, ...card, useMem0Card: card.useMem0Card })
assert.ok(rendered !== null && rendered !== undefined, 'card component renders')

console.log('smoke-client: ok — bundle loads, card registers, form stages/saves/discards correctly')
