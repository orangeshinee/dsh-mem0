/**
 * Agent tools: the dsh-native way to read and write a self-hosted mem0.
 * Every tool talks to the same REST client the plugin configures, so a
 * server + API key set once (settings section or config entry) is
 * immediately operable by any agent.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { Mem0Config } from './config.js'
import type { Mem0Client, Mem0HistoryEntry, Mem0Memory } from './mem0-client.js'

/** One text content block (the only render shape these tools emit). */
function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

/** Compact one-line view of a memory. */
function renderMemory(m: Mem0Memory, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : ''
  const score = m.score !== undefined ? ` [score ${m.score.toFixed(3)}]` : ''
  const id = m.id ? ` (${m.id})` : ''
  return `${prefix}${m.memory ?? '(empty)'}${id}${score}`
}

/** Table-style list render. */
function renderMemories(results: Mem0Memory[] | undefined): string {
  if (!results || results.length === 0) return 'no memories found'
  return results.map((m, i) => renderMemory(m, i)).join('\n')
}

/**
 * Resolve identifiers from tool args, falling back to config defaults.
 *
 * `defaultUserId` always applies. `defaultAgentId` applies for writes
 * (add) so new memories are attributed to the default agent; for queries
 * (list / search / bulk delete) it is used only when explicitly passed,
 * otherwise older memories whose agent_id is null would be filtered out.
 */
function resolveIds(
  args: { user_id?: string; agent_id?: string; run_id?: string },
  config: () => Mem0Config,
  opts: { defaultAgent?: boolean } = {},
): { user_id?: string; agent_id?: string; run_id?: string } {
  const ids: { user_id?: string; agent_id?: string; run_id?: string } = {}
  const value = config()
  if (args.user_id) ids.user_id = args.user_id
  else if (value.defaultUserId) ids.user_id = value.defaultUserId
  if (args.agent_id) ids.agent_id = args.agent_id
  else if (opts.defaultAgent && value.defaultAgentId) ids.agent_id = value.defaultAgentId
  if (args.run_id) ids.run_id = args.run_id
  return ids
}

/** Shared error wrapper for every tool's execute(). */
function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

/** Error wrapper that also fills the fields the output schema marks required. */
function failWith<T extends object>(error: unknown, extra: T): { ok: false; error: string } & T {
  return { ok: false, error: error instanceof Error ? error.message : String(error), ...extra }
}

/** Cast a structured object into the lossless JSON the tool schema expects. */
function asJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** One-line render of a history entry. */
function renderHistoryEntry(entry: Mem0HistoryEntry, index: number): string {
  const event = entry.event ?? '?'
  const when = entry.created_at ? ` @${entry.created_at}` : ''
  const change =
    entry.old_memory === null || entry.old_memory === undefined
      ? `-> ${entry.new_memory ?? '(empty)'}`
      : `${entry.old_memory} -> ${entry.new_memory ?? '(empty)'}`
  return `${index + 1}. [${event}]${when}\n   ${change}`
}

/** The add tool: `POST /memories`. */
export function mem0AddTool(client: Mem0Client, config: () => Mem0Config) {
  return defineTool({
    name: 'mem0_add',
    description:
      'Store new memories into the self-hosted mem0. Provide either a single message string (messages, role defaults to "user") ' +
      'or an array of {role, content} messages. Memories are stored under user_id / agent_id / run_id (defaults from plugin config). ' +
      'Use mem0_search to find existing memories first when the same fact may already be stored. ' +
      'Triggers: 记住 / 记下来 / 写入 mem0 / save to mem0 / add memory / remember this.',
    parameters: {
      messages: {
        oneOf: [
          { type: 'string', description: 'One message content (role defaults to "user").' },
          {
            type: 'array',
            description: 'Chat-style messages to extract memories from.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                role: { type: 'string', required: true },
                content: { type: 'string', required: true },
              },
            },
          },
        ],
        required: true,
        description: 'Content to memorize: a string, or an array of {role, content} messages.',
      },
      role: { type: 'string', description: 'Role for the single-string form (default "user").' },
      user_id: { type: 'string', description: 'Scoped memory owner; defaults to plugin defaultUserId.' },
      agent_id: { type: 'string', description: 'Agent-scoped memory owner; defaults to plugin defaultAgentId.' },
      run_id: { type: 'string', description: 'Run-scoped identifier.' },
      metadata: { type: 'object', additionalProperties: true, description: 'Arbitrary key/value metadata to attach.' },
      infer: { type: 'boolean', description: 'Whether the server should infer facts automatically (default true).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          created: { type: 'integer', required: true },
          results: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                memory: { type: 'string' },
              },
            },
          },
          error: { type: 'string' },
        },
      },
      render: (_args, value: { ok: boolean; created?: number; results?: Array<{ id?: string; memory?: string }>; error?: string }) =>
        text(
          value.ok
            ? `added ${value.created ?? 0} memory/memories:\n${(value.results ?? []).map((m) => renderMemory(m)).join('\n')}`
            : `mem0_add failed: ${value.error ?? 'unknown error'}`,
        ),
    },
    async execute(args: {
      messages: string | Array<{ role: string; content: string }>
      role?: string
      user_id?: string
      agent_id?: string
      run_id?: string
      metadata?: Record<string, JsonValue>
      infer?: boolean
    }) {
      try {
        const messages =
          typeof args.messages === 'string'
            ? [{ role: args.role ?? 'user', content: args.messages }]
            : args.messages
        const response = await client.add({
          messages,
          ...resolveIds(args, config, { defaultAgent: true }),
          ...(args.metadata ? { metadata: args.metadata } : {}),
          ...(args.infer !== undefined ? { infer: args.infer } : {}),
        })
        const results = response.results ?? []
        return {
          ok: true,
          created: results.length,
          results: results.map((m) => ({ id: m.id, memory: m.memory })),
        }
      } catch (error) {
        return failWith(error, { created: 0, results: [] })
      }
    },
  })
}

/** The search tool: `POST /search`. */
export function mem0SearchTool(client: Mem0Client, config: () => Mem0Config) {
  return defineTool({
    name: 'mem0_search',
    description:
      'Semantic search over memories stored in the self-hosted mem0. Returns the closest memories with relevance scores. ' +
      'Search is scoped to user_id / agent_id / run_id (defaults from plugin config). ' +
      'Triggers: 搜索记忆 / 查一下我记住的 / search memory / recall from mem0 / 找记忆.',
    parameters: {
      query: { type: 'string', required: true, description: 'The search query, natural language.' },
      user_id: { type: 'string', description: 'Scope; defaults to plugin defaultUserId.' },
      agent_id: { type: 'string', description: 'Scope; only applied when explicitly passed (queries do not fall back to the default agent_id, so memories without an agent stay visible).' },
      run_id: { type: 'string', description: 'Run-scoped identifier.' },
      top_k: { type: 'integer', description: 'Max results (server default 100).' },
      threshold: { type: 'number', description: 'Minimum similarity score (0..1) to include a result.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          count: { type: 'integer', required: true },
          results: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                memory: { type: 'string' },
                score: { type: 'number' },
              },
            },
          },
          error: { type: 'string' },
        },
      },
      render: (args, value: { ok: boolean; count?: number; results?: Array<{ id?: string; memory?: string; score?: number }>; error?: string }) =>
        text(
          value.ok
            ? `search "${String((args as { query?: string }).query ?? '')}" -> ${value.count ?? 0} result(s):\n${renderMemories(value.results as Mem0Memory[] | undefined)}`
            : `mem0_search failed: ${value.error ?? 'unknown error'}`,
        ),
    },
    async execute(args: { query: string; user_id?: string; agent_id?: string; run_id?: string; top_k?: number; threshold?: number }) {
      try {
        const response = await client.search({
          query: args.query,
          filters: resolveIds(args, config),
          top_k: args.top_k,
          threshold: args.threshold,
        })
        const results = response.results ?? []
        return { ok: true, count: results.length, results }
      } catch (error) {
        return failWith(error, { count: 0, results: [] })
      }
    },
  })
}

/** The read tool: `GET /memories` (list) and `GET /memories/{id}` (one). */
export function mem0GetTool(client: Mem0Client, config: () => Mem0Config) {
  return defineTool({
    name: 'mem0_get',
    description:
      'Read memories from the self-hosted mem0. With id, returns that one memory; without id, lists memories ' +
      'scoped to user_id / agent_id / run_id (defaults from plugin config). Set all=true to list every memory ' +
      'across identifiers (including agent-only memories with no user_id; requires admin on the server). ' +
      'Triggers: 读取记忆 / 查看记忆 / get memory / list memories from mem0.',
    parameters: {
      id: { type: 'string', description: 'A specific memory id (from mem0_search / mem0_get).' },
      user_id: { type: 'string', description: 'Scope; defaults to plugin defaultUserId.' },
      agent_id: { type: 'string', description: 'Scope; only applied when explicitly passed (queries do not fall back to the default agent_id, so memories without an agent stay visible).' },
      run_id: { type: 'string', description: 'Run-scoped identifier.' },
      top_k: { type: 'integer', description: 'Max rows when listing (server cap 1000).' },
      all: { type: 'boolean', description: 'List all memories across identifiers (no default scoping; admin required).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          count: { type: 'integer' },
          memory: { type: 'json' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                memory: { type: 'string' },
                user_id: { type: 'string' },
                agent_id: { type: 'string' },
                run_id: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' },
                metadata: { type: 'object', additionalProperties: true },
              },
            },
          },
          error: { type: 'string' },
        },
      },
      render: (args, value: { ok: boolean; count?: number; memory?: JsonValue | null; results?: Mem0Memory[]; error?: string }) =>
        text(
          value.ok
            ? (args as { id?: string }).id
              ? value.memory
                ? renderMemory(value.memory as Mem0Memory)
                : 'memory not found'
              : `${value.count ?? 0} memory/memories:\n${renderMemories(value.results)}`
            : `mem0_get failed: ${value.error ?? 'unknown error'}`,
        ),
    },
    async execute(args: { id?: string; user_id?: string; agent_id?: string; run_id?: string; top_k?: number; all?: boolean }) {
      try {
        if (args.id) {
          const memory = await client.get(args.id)
          return { ok: true, memory: memory as unknown as JsonValue }
        }
        const response =
          args.all === true
            ? await client.list({ top_k: args.top_k })
            : await client.list({ ...resolveIds(args, config), top_k: args.top_k })
        const results = response.results ?? []
        return { ok: true, count: results.length, results: results.map((m) => asJson(m)) }
      } catch (error) {
        return failWith(error, { count: 0 })
      }
    },
  })
}

/** The update tool: `PUT /memories/{id}`. */
export function mem0UpdateTool(client: Mem0Client) {
  return defineTool({
    name: 'mem0_update',
    description:
      'Update a stored memory in the self-hosted mem0 by id (use mem0_search or mem0_get to find the id first). ' +
      'Triggers: 更新记忆 / 修改记忆 / update memory / edit memory in mem0.',
    parameters: {
      id: { type: 'string', required: true, description: 'The memory id to update.' },
      text: { type: 'string', description: 'New text content for the memory.' },
      metadata: { type: 'object', additionalProperties: true, description: 'Replace the memory metadata.' },
      expiration_date: { type: 'string', description: 'Optional expiration timestamp (ISO 8601).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (args, value: { ok: boolean; message?: string; error?: string }) =>
        text(
          value.ok
            ? `updated memory ${String((args as { id?: string }).id ?? '')}: ${value.message ?? 'ok'}`
            : `mem0_update failed: ${value.error ?? 'unknown error'}`,
        ),
    },
    async execute(args: { id: string; text?: string; metadata?: Record<string, JsonValue>; expiration_date?: string }) {
      try {
        const response = await client.update(args.id, {
          text: args.text,
          metadata: args.metadata,
          expiration_date: args.expiration_date,
        })
        // String(undefined) would render the literal "undefined"; only carry a
        // real string message when the server answered one.
        let message = ''
        if (typeof response === 'object' && response !== null && 'message' in response) {
          const raw = (response as { message?: unknown }).message
          if (typeof raw === 'string') message = raw
        }
        return { ok: true, message }
      } catch (error) {
        return failure(error)
      }
    },
  })
}

/** The delete tool: `DELETE /memories/{id}` or `DELETE /memories`. */
export function mem0DeleteTool(client: Mem0Client, config: () => Mem0Config) {
  return defineTool({
    name: 'mem0_delete',
    description:
      'Delete memories from the self-hosted mem0. With id, deletes that one memory. Without id, deletes ALL memories of the ' +
      'resolved identifiers (user_id / agent_id / run_id) — requires confirm: "DELETE ALL" and an admin server role. ' +
      'Destructive: always confirm the target before calling. Triggers: 删除记忆 / delete memory / remove from mem0.',
    parameters: {
      id: { type: 'string', description: 'Specific memory id to delete (from mem0_search / mem0_get).' },
      user_id: { type: 'string', description: 'Scope for bulk delete; defaults to plugin defaultUserId.' },
      agent_id: { type: 'string', description: 'Scope for bulk delete; only applied when explicitly passed (queries do not fall back to the default agent_id, so memories without an agent stay visible).' },
      run_id: { type: 'string', description: 'Run-scoped identifier.' },
      confirm: {
        type: 'string',
        description: 'Required for bulk delete (no id): must be exactly "DELETE ALL".',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (args, value: { ok: boolean; message?: string; error?: string }) =>
        text(
          value.ok
            ? `deleted ${String((args as { id?: string }).id ?? '(scoped batch)')}: ${value.message ?? 'ok'}`
            : `mem0_delete failed: ${value.error ?? 'unknown error'}`,
        ),
    },
    async execute(args: { id?: string; user_id?: string; agent_id?: string; run_id?: string; confirm?: string }) {
      try {
        if (args.id) {
          const response = await client.remove(args.id)
          return { ok: true, message: response.message ?? '' }
        }
        if (args.confirm !== 'DELETE ALL') {
          return { ok: false, error: 'bulk delete requires confirm: "DELETE ALL"' }
        }
        const ids = resolveIds(args, config)
        if (!ids.user_id && !ids.agent_id && !ids.run_id) {
          return { ok: false, error: 'bulk delete requires at least one identifier' }
        }
        const response = await client.removeAll(ids)
        return { ok: true, message: response.message ?? '' }
      } catch (error) {
        return failure(error)
      }
    },
  })
}

/** The history tool: `GET /memories/{id}/history`. */
export function mem0HistoryTool(client: Mem0Client) {
  return defineTool({
    name: 'mem0_history',
    description:
      'Show the edit history of one memory in the self-hosted mem0 (created_at, updated_at, previous values). ' +
      'Use mem0_search / mem0_get to find the id first. Triggers: 记忆历史 / history of memory.',
    parameters: {
      id: { type: 'string', required: true, description: 'The memory id to inspect.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          id: { type: 'string' },
          history: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                memory_id: { type: 'string' },
                old_memory: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                new_memory: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                event: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                is_deleted: { type: 'boolean' },
              },
            },
          },
          error: { type: 'string' },
        },
      },
      render: (args, value: { ok: boolean; id?: string; history?: Mem0HistoryEntry[]; error?: string }) =>
        text(
          value.ok
            ? `history of ${value.id ?? ''}:\n${(value.history ?? []).length === 0 ? 'no history' : value.history!.map((h, i) => renderHistoryEntry(h, i)).join('\n')}`
            : `mem0_history failed: ${value.error ?? 'unknown error'}`,
        ),
    },
    async execute(args: { id: string }) {
      try {
        const history = await client.history(args.id)
        return { ok: true, id: args.id, history: asJson(history) as unknown as Mem0HistoryEntry[] }
      } catch (error) {
        return failure(error)
      }
    },
  })
}

/** The reset tool: `POST /reset` (admin). */
export function mem0ResetTool(client: Mem0Client) {
  return defineTool({
    name: 'mem0_reset',
    description:
      'Wipe ALL memories from the self-hosted mem0. Destructive and irreversible; requires admin server role ' +
      'and confirm: "RESET" exactly. Triggers: 清空记忆 / reset mem0.',
    parameters: {
      confirm: { type: 'string', required: true, description: 'Must be exactly "RESET".' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (args, value: { ok: boolean; message?: string; error?: string }) =>
        text(
          value.ok
            ? `reset: ${value.message ?? 'ok'}`
            : `mem0_reset failed: ${value.error ?? 'unknown error'}`,
        ),
    },
    async execute(args: { confirm: string }) {
      if (args.confirm !== 'RESET') {
        return { ok: false, error: 'reset requires confirm: "RESET"' }
      }
      try {
        const response = await client.reset()
        return { ok: true, message: response.message ?? '' }
      } catch (error) {
        return failure(error)
      }
    },
  })
}

/** The status tool: health + auth + configuration check. */
export function mem0StatusTool(client: Mem0Client) {
  return defineTool({
    name: 'mem0_status',
    description:
      'Check the self-hosted mem0 connection: server reachability, auth state (needs an apiKey), and the current ' +
      'server configuration. The API key itself is never printed. Triggers: mem0 状态 / check mem0 / mem0 健康检查.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          reachable: { type: 'boolean', required: true },
          authenticated: { type: 'boolean', required: true },
          setupStatus: {
            oneOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }],
          },
          authError: { type: 'string' },
          configure: { type: 'json' },
          error: { type: 'string' },
        },
      },
      render: (_args, value: { ok: boolean; reachable?: boolean; authenticated?: boolean; setupStatus?: { needsSetup?: boolean } | null; authError?: string; configure?: JsonValue; error?: string }) => {
        if (!value.ok) return text(`mem0_status failed: ${value.error ?? 'unknown error'}`)
        const lines = [
          value.reachable ? 'server: reachable' : 'server: unreachable',
          `setupStatus: ${JSON.stringify(value.setupStatus ?? null)}`,
          value.authenticated ? 'auth: ok (apiKey accepted)' : `auth: not authenticated${value.authError ? ` — ${value.authError}` : ''}`,
        ]
        if (value.configure !== undefined) lines.push(`configure: ${JSON.stringify(value.configure)}`)
        return text(lines.join('\n'))
      },
    },
    async execute() {
      try {
        const status = await client.status()
        return {
          ok: status.reachable,
          reachable: status.reachable,
          authenticated: status.authenticated,
          setupStatus: (status.setupStatus ?? null) as { needsSetup?: boolean } | null,
          authError: status.authError ?? '',
          ...(status.configure !== undefined ? { configure: status.configure as unknown as JsonValue } : {}),
        }
      } catch (error) {
        return { ...failure(error), reachable: false, authenticated: false }
      }
    },
  })
}
