/**
 * End-to-end smoke test of the mem0 REST client against the real instance.
 * Uses a dedicated test user_id so real data (Tony / dsh-agent) is untouched.
 * Cleans up every memory it creates.
 *
 * Requires MEM0_API_KEY / MEM0_BASE_URL (see AGENTS.md); refuses to run
 * against a live instance with hard-coded credentials.
 */
const KEY = process.env.MEM0_API_KEY ?? ''
const BASE = process.env.MEM0_BASE_URL ?? ''
const USER = process.env.MEM0_TEST_USER ?? 'dsh-mem0-test'

if (!KEY || !BASE) {
  console.error('refusing to run: set MEM0_API_KEY and MEM0_BASE_URL first (see AGENTS.md)')
  process.exit(1)
}

import('../lib/mem0-client.js').then(async ({ Mem0Client }) => {
  const client = new Mem0Client(() => ({ baseUrl: BASE, apiKey: KEY, authType: 'apiKey', timeoutMs: 15000 }))
  const results = []
  const step = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`) }
  const ids = []

  try {
    // 1. status / auth
    const status = await client.status()
    step('status/reachable', status.reachable === true, `authenticated=${status.authenticated}`)
    step('status/authenticated', status.authenticated === true, status.authError ?? '')

    // 2. add (two memories) — note: the server translates Chinese facts to English by default
    const add1 = await client.add({ messages: [{ role: 'user', content: '我的测试记忆：北极熊的毛发是透明的，看起来白是因为反光。' }], user_id: USER })
    const mem1 = add1.results?.[0]
    step('add/memory1', !!mem1?.id, `id=${mem1?.id}`)
    if (mem1?.id) ids.push(mem1.id)

    const add2 = await client.add({ messages: [{ role: 'user', content: '我的测试记忆：企鹅只生活在南半球。' }], user_id: USER, metadata: { tag: 'test' } })
    const mem2 = add2.results?.[0]
    step('add/memory2', !!mem2?.id, `id=${mem2?.id}`)
    if (mem2?.id) ids.push(mem2.id)

    // 3. search — use English keywords because storage is translated English
    const search = await client.search({ query: 'penguin', filters: { user_id: USER } })
    step('search', (search.results?.length ?? 0) > 0, `count=${search.results?.length}`)
    const hit = search.results?.find((m) => m.memory?.toLowerCase().includes('penguin'))
    step('search/hit-penguin', !!hit, hit ? `score=${hit.score}` : 'no hit')

    // 4. list scoped
    const list = await client.list({ user_id: USER })
    step('list/scoped', (list.results?.length ?? 0) >= 2, `count=${list.results?.length}`)

    // 5. get one (memory content is server-translated English)
    const got = await client.get(mem1.id)
    step('get/one', typeof got?.memory === 'string' && got.memory.length > 0, `memory=${got?.memory}`)

    // 6. update
    const updated = await client.update(mem1.id, { text: '我的测试记忆（已更新）：北极熊的皮肤是黑色的。' })
    const got2 = await client.get(mem1.id)
    step('update', typeof updated === 'object' && typeof got2?.memory === 'string' && got2.memory.length > 0, `now=${got2?.memory}`)

    // 7. history — the endpoint returns a bare array
    const history = await client.history(mem1.id)
    step('history', Array.isArray(history) && history.length > 0, `entries=${history.length}`)

    // 8. cleanup
    for (const id of ids) {
      const del = await client.remove(id)
      step(`delete/${id.slice(0, 8)}`, typeof del === 'object', del.message ?? '')
    }
    const after = await client.list({ user_id: USER })
    step('cleanup/empty', (after.results?.length ?? 0) === 0, `remaining=${after.results?.length}`)

    // 9. missing-key behavior (sanity)
    const noKey = new Mem0Client(() => ({ baseUrl: BASE, apiKey: '', authType: 'apiKey', timeoutMs: 8000 }))
    const bad = await noKey.search({ query: 'x', filters: { user_id: USER } }).catch((e) => ({ error: e.message }))
    step('auth/missing-key-rejected', 'error' in bad && String(bad.error).includes('401'), bad.error ?? '')
  } catch (error) {
    step('exception', false, error instanceof Error ? error.stack ?? error.message : String(error))
  }

  console.log(results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FAIL')).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  process.exit(failed > 0 ? 1 : 0)
})
