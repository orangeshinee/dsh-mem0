/**
 * Minimal REST client for the self-hosted mem0 OSS server (new build with
 * dashboard: `mem0/mem0-api-server`). The OSS server mounts routes without
 * the `/v1/` prefix (that is the hosted platform at api.mem0.ai only), so
 * every path here is relative to the configured `baseUrl`.
 *
 * Endpoints follow server/main.py (see mem0ai/mem0):
 *   POST   /memories                     create memories
 *   GET    /memories                     list (filters via query params)
 *   GET    /memories/{id}                get one
 *   PUT    /memories/{id}                update (text / metadata / expiration_date)
 *   DELETE /memories/{id}                delete one
 *   DELETE /memories                     delete all for an identifier (admin)
 *   GET    /memories/{id}/history        history
 *   POST   /search                       semantic search
 *   POST   /reset                        reset everything (admin)
 *   GET    /configure                    current configuration
 *   GET    /auth/setup-status            open health probe
 *
 * Auth: `X-API-Key` (per-user `m0sk_...` or legacy `ADMIN_API_KEY`) or
 * `Authorization: Bearer <jwt>`; `AUTH_DISABLED=true` deployments accept no
 * header. Errors surface as {@link Mem0ApiError} with the server's detail.
 */

import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { Mem0Config } from './config.js'

/** One chat-style message fed to `POST /memories`. */
export interface Mem0Message {
  role: string
  content: string
}

/** Identifier filters shared by list / search / delete-all. */
export interface Mem0Filters {
  user_id?: string
  agent_id?: string
  run_id?: string
}

/** Options for `POST /memories`. */
export interface Mem0AddOptions {
  messages: Mem0Message[]
  user_id?: string
  agent_id?: string
  run_id?: string
  metadata?: Record<string, JsonValue>
  infer?: boolean
}

/** Options for `POST /search`. */
export interface Mem0SearchOptions {
  query: string
  filters?: Mem0Filters
  top_k?: number
  threshold?: number
}

/** Options for `GET /memories` (list) and `DELETE /memories` (delete all). */
export interface Mem0ListOptions {
  user_id?: string
  agent_id?: string
  run_id?: string
  top_k?: number
}

/** Options for `PUT /memories/{id}`. */
export interface Mem0UpdateOptions {
  text?: string
  metadata?: Record<string, JsonValue>
  expiration_date?: string
}

/** One serialized memory row (new OSS `_serialize_memory` shape). */
export interface Mem0Memory {
  id?: string
  memory?: string
  user_id?: string
  agent_id?: string
  run_id?: string
  hash?: string
  expiration_date?: string | null
  metadata?: Record<string, JsonValue>
  created_at?: string
  updated_at?: string
  /** Search result extra fields. */
  score?: number
  prev_value?: string
  new_value?: string
}

/** Error thrown when the mem0 server answers non-2xx or the request fails. */
export class Mem0ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: unknown,
    readonly method?: string,
    readonly path?: string,
  ) {
    super(message)
    this.name = 'Mem0ApiError'
  }
}

/** Client-side request timeout. */
export class Mem0TimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`mem0 request timed out after ${timeoutMs} ms`)
    this.name = 'Mem0TimeoutError'
  }
}

/** One memory history entry (raw SDK shape: the endpoint returns a bare array). */
export interface Mem0HistoryEntry {
  id?: string
  memory_id?: string
  old_memory?: string | null
  new_memory?: string | null
  event?: string
  created_at?: string
  updated_at?: string | null
  is_deleted?: boolean
  actor_id?: string | null
  role?: string | null
}

/**
 * Fetch wrapper that reads the live config on every call, so settings edits
 * apply immediately without re-creating the client or the tools.
 */
export class Mem0Client {
  constructor(private readonly config: () => Mem0Config) {}

  /** Current base URL (normalized, no trailing slash). */
  private get baseUrl(): string {
    return (this.config().baseUrl ?? '').replace(/\/+$/, '')
  }

  private authHeaders(): Record<string, string> {
    const value = this.config()
    const key = value.apiKey?.trim()
    if (!key) return {}
    switch (value.authType ?? 'apiKey') {
      case 'jwt':
        return { Authorization: `Bearer ${key}` }
      case 'none':
        return {}
      case 'adminKey':
      case 'apiKey':
      default:
        return { 'X-API-Key': key }
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = new URL(this.baseUrl + path)
    if (query) {
      for (const [key, raw] of Object.entries(query)) {
        if (raw !== undefined && raw !== null && raw !== '') url.searchParams.set(key, String(raw))
      }
    }
    const timeoutMs = this.config().timeoutMs ?? 15000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Mem0TimeoutError(timeoutMs)
      throw new Mem0ApiError(
        `mem0 request failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        method,
        path,
      )
    } finally {
      clearTimeout(timer)
    }

    const text = await response.text().catch(() => '')
    let payload: unknown
    try {
      payload = text === '' ? null : JSON.parse(text)
    } catch {
      payload = text
    }

    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'detail' in payload ? (payload as { detail: unknown }).detail : payload
      const snippet = typeof detail === 'string' ? detail : JSON.stringify(detail ?? text ?? '')
      throw new Mem0ApiError(
        `mem0 ${method} ${path} -> ${response.status}${snippet ? `: ${snippet}` : ''}`,
        response.status,
        detail,
        method,
        path,
      )
    }
    return payload as T
  }

  /** `POST /memories` — store new memories. At least one identifier is required. */
  add(options: Mem0AddOptions): Promise<{ results?: Mem0Memory[]; events?: unknown }> {
    return this.request('POST', '/memories', options)
  }

  /** `POST /search` — semantic search over stored memories. */
  search(options: Mem0SearchOptions): Promise<{ results?: Mem0Memory[] }> {
    const { query, filters, top_k, threshold } = options
    const body: Record<string, unknown> = { query }
    if (filters && Object.keys(filters).length > 0) body.filters = filters
    if (top_k !== undefined) body.top_k = top_k
    if (threshold !== undefined) body.threshold = threshold
    return this.request('POST', '/search', body)
  }

  /** `GET /memories` — list memories, optionally scoped to identifiers. */
  list(options?: Mem0ListOptions): Promise<{ results?: Mem0Memory[] }> {
    return this.request('GET', '/memories', undefined, {
      user_id: options?.user_id,
      agent_id: options?.agent_id,
      run_id: options?.run_id,
      top_k: options?.top_k,
    })
  }

  /** `GET /memories/{id}` — one memory. */
  get(id: string): Promise<Mem0Memory> {
    return this.request('GET', `/memories/${encodeURIComponent(id)}`)
  }

  /** `PUT /memories/{id}` — update a memory's text / metadata / expiration. */
  update(id: string, options: Mem0UpdateOptions): Promise<unknown> {
    const body: Record<string, unknown> = {}
    if (options.text !== undefined) body.text = options.text
    if (options.metadata !== undefined) body.metadata = options.metadata
    if (options.expiration_date !== undefined) body.expiration_date = options.expiration_date
    if (Object.keys(body).length === 0) {
      throw new Mem0ApiError('mem0 update requires at least one of text / metadata / expiration_date', 400, undefined, 'PUT', `/memories/${id}`)
    }
    return this.request('PUT', `/memories/${encodeURIComponent(id)}`, body)
  }

  /** `DELETE /memories/{id}` — delete one memory. */
  remove(id: string): Promise<{ message?: string }> {
    return this.request('DELETE', `/memories/${encodeURIComponent(id)}`)
  }

  /** `DELETE /memories` — delete all memories for an identifier (admin role). */
  removeAll(options: Mem0Filters): Promise<{ message?: string }> {
    return this.request('DELETE', '/memories', undefined, {
      user_id: options.user_id,
      agent_id: options.agent_id,
      run_id: options.run_id,
    })
  }

  /** `GET /memories/{id}/history` — full edit history of one memory (bare array). */
  history(id: string): Promise<Mem0HistoryEntry[]> {
    return this.request('GET', `/memories/${encodeURIComponent(id)}/history`)
  }

  /** `POST /reset` — wipe all memories (admin role). */
  reset(): Promise<{ message?: string }> {
    return this.request('POST', '/reset')
  }

  /** `GET /configure` — current memory configuration (keys redacted upstream). */
  configure(): Promise<unknown> {
    return this.request('GET', '/configure')
  }

  /** Open health probe: `GET /auth/setup-status` never requires auth. */
  async setupStatus(): Promise<{ needsSetup?: boolean } | null> {
    try {
      return await this.request('GET', '/auth/setup-status')
    } catch (error) {
      if (error instanceof Mem0ApiError && error.status === 404) return null
      throw error
    }
  }

  /**
   * Connection + auth check used by `mem0_status`:
   * probe the open route, then (when an API key is configured) the
   * authenticated /configure route. Returns a compact, safe summary.
   */
  async status(): Promise<{
    reachable: boolean
    setupStatus: { needsSetup?: boolean } | null
    authenticated: boolean
    authError?: string
    configure?: unknown
  }> {
    let setupStatus: { needsSetup?: boolean } | null = null
    try {
      setupStatus = await this.setupStatus()
    } catch (error) {
      return {
        reachable: false,
        setupStatus: null,
        authenticated: false,
        authError: error instanceof Error ? error.message : String(error),
      }
    }
    let authenticated = false
    let authError: string | undefined
    let configure: unknown
    if (this.config().apiKey) {
      try {
        configure = await this.configure()
        authenticated = true
      } catch (error) {
        authError = error instanceof Error ? error.message : String(error)
      }
    } else {
      authError = 'no apiKey configured'
    }
    return { reachable: true, setupStatus, authenticated, authError, configure }
  }
}
