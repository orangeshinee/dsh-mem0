/**
 * Load test: run the plugin's apply() against a minimal mock host context
 * and verify the expected tools + prompt section are registered without
 * throwing. No network and no real cordis runtime needed.
 */
import { apply } from '../lib/index.js'

const registeredTools = []
const sections = []
let effectsActive = 0

const ctx = {
  fiber: { state: 'active' },
  get: () => undefined,
  inject: (deps, cb) =>
    cb({
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
console.log('effects active:', effectsActive)
if (missing.length > 0) { console.error('MISSING:', missing.join(', ')); process.exit(1) }
if (sections.length !== 1 || sections[0].name !== 'plugin:dsh-mem0') { console.error('section mismatch'); process.exit(1) }
console.log('OK: all 8 tools + announcement section registered')
