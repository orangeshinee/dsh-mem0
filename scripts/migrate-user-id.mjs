/**
 * Migrate memories with user_id=null to user_id=HeTony.
 *
 * The mem0 OSS API cannot change a memory's ownership (PUT /memories/{id}
 * only takes text/metadata/expiration_date), so the migration rebuilds each
 * record via POST /memories with infer=false — which stores the message
 * content verbatim (no LLM extraction, no translation) — keeping the same
 * agent_id, then deletes the original row. Content is preserved 1:1; ids
 * and timestamps change.
 *
 * DESTRUCTIVE: this script rebuilds AND deletes records. It refuses to run
 * without MEM0_API_KEY / MEM0_BASE_URL and an explicit MIGRATE_CONFIRM=yes.
 */

const KEY = process.env.MEM0_API_KEY ?? ''
const BASE = process.env.MEM0_BASE_URL ?? ''
const TARGET_USER = process.env.MIGRATE_TARGET_USER ?? 'HeTony'

if (!KEY || !BASE) {
  console.error('refusing to run: set MEM0_API_KEY and MEM0_BASE_URL first (see AGENTS.md)')
  process.exit(1)
}
if (process.env.MIGRATE_CONFIRM?.toLowerCase() !== 'yes') {
  console.error('refusing to run: this script rebuilds and deletes records; set MIGRATE_CONFIRM=yes to proceed')
  process.exit(1)
}

import('../lib/mem0-client.js').then(async ({ Mem0Client }) => {
  const c = new Mem0Client(() => ({ baseUrl: BASE, apiKey: KEY, authType: 'apiKey', timeoutMs: 30000 }))
  const all = await c.list({})
  const orphans = (all.results ?? []).filter((r) => !r.user_id)
  console.log(`orphans with user_id=null: ${orphans.length}`)
  if (orphans.length === 0) { console.log('nothing to migrate'); process.exit(0) }

  // 1. rebuild with infer=false (verbatim content), keeping agent_id
  const rebuilt = []
  for (const m of orphans) {
    const payload = {
      messages: [{ role: 'user', content: m.memory ?? '' }],
      user_id: TARGET_USER,
      infer: false,
    }
    if (m.agent_id) payload.agent_id = m.agent_id
    if (m.metadata && Object.keys(m.metadata).length > 0) payload.metadata = m.metadata
    const add = await c.add(payload)
    const newId = add.results?.[0]?.id
    if (!newId) throw new Error(`add failed for ${m.id}: ${JSON.stringify(add)}`)
    const verify = await c.get(newId)
    if (verify.user_id !== TARGET_USER) throw new Error(`verify failed: new record ${newId} has user_id=${verify.user_id}`)
    const same = (verify.memory ?? '') === (m.memory ?? '')
    if (!same) throw new Error(`content mismatch for ${m.id} -> ${newId}`)
    rebuilt.push({ old: m.id, new: newId, agent: m.agent_id ?? '(null)', ok: true })
    console.log(`rebuilt ${m.id.slice(0, 8)} (agent=${m.agent_id ?? 'null'}) -> ${newId.slice(0, 8)} content-identical=${same}`)
  }

  // 2. delete originals only after every rebuild verified
  for (const r of rebuilt) {
    const del = await c.remove(r.old)
    console.log(`deleted original ${r.old.slice(0, 8)}: ${del.message ?? 'ok'}`)
  }

  // 3. final verification
  const after = await c.list({})
  const remainingOrphans = (after.results ?? []).filter((r) => !r.user_id)
  const heTony = (after.results ?? []).filter((r) => r.user_id === TARGET_USER)
  console.log('--- final ---')
  console.log(`total: ${after.results.length} | user_id=null: ${remainingOrphans.length} | HeTony: ${heTony.length}`)
  if (remainingOrphans.length > 0) { console.error('FAIL: orphans remain'); process.exit(1) }
  console.log('migration complete')
})
