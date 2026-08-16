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
import type { JsonValue } from '@deepseek-ai/dsh-session';
import type { Mem0Config } from './config.js';
/** One chat-style message fed to `POST /memories`. */
export interface Mem0Message {
    role: string;
    content: string;
}
/** Identifier filters shared by list / search / delete-all. */
export interface Mem0Filters {
    user_id?: string;
    agent_id?: string;
    run_id?: string;
}
/** Options for `POST /memories`. */
export interface Mem0AddOptions {
    messages: Mem0Message[];
    user_id?: string;
    agent_id?: string;
    run_id?: string;
    metadata?: Record<string, JsonValue>;
    infer?: boolean;
}
/** Options for `POST /search`. */
export interface Mem0SearchOptions {
    query: string;
    filters?: Mem0Filters;
    top_k?: number;
    threshold?: number;
}
/** Options for `GET /memories` (list) and `DELETE /memories` (delete all). */
export interface Mem0ListOptions {
    user_id?: string;
    agent_id?: string;
    run_id?: string;
    top_k?: number;
}
/** Options for `PUT /memories/{id}`. */
export interface Mem0UpdateOptions {
    text?: string;
    metadata?: Record<string, JsonValue>;
    expiration_date?: string;
}
/** One serialized memory row (new OSS `_serialize_memory` shape). */
export interface Mem0Memory {
    id?: string;
    memory?: string;
    user_id?: string;
    agent_id?: string;
    run_id?: string;
    hash?: string;
    /** Field the OSS server sets on serialized rows (always present on the new build). */
    attributed_to?: string;
    /** Field the OSS server sets on serialized rows (present on newer rows). */
    role?: string;
    expiration_date?: string | null;
    metadata?: Record<string, JsonValue> | null;
    created_at?: string;
    updated_at?: string;
    /** Search result extra fields. */
    score?: number;
    prev_value?: string;
    new_value?: string;
}
/** Error thrown when the mem0 server answers non-2xx or the request fails. */
export declare class Mem0ApiError extends Error {
    readonly status?: number | undefined;
    readonly detail?: unknown | undefined;
    readonly method?: string | undefined;
    readonly path?: string | undefined;
    constructor(message: string, status?: number | undefined, detail?: unknown | undefined, method?: string | undefined, path?: string | undefined);
}
/** Client-side request timeout. */
export declare class Mem0TimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(timeoutMs: number);
}
/** One memory history entry (raw SDK shape: the endpoint returns a bare array). */
export interface Mem0HistoryEntry {
    id?: string;
    memory_id?: string;
    old_memory?: string | null;
    new_memory?: string | null;
    event?: string;
    created_at?: string;
    updated_at?: string | null;
    is_deleted?: boolean;
    actor_id?: string | null;
    role?: string | null;
}
/**
 * Fetch wrapper that reads the live config on every call, so settings edits
 * apply immediately without re-creating the client or the tools.
 */
export declare class Mem0Client {
    private readonly config;
    constructor(config: () => Mem0Config);
    /** Current base URL (normalized, no trailing slash). */
    private get baseUrl();
    private authHeaders;
    private request;
    /** `POST /memories` — store new memories. At least one identifier is required. */
    add(options: Mem0AddOptions): Promise<{
        results?: Mem0Memory[];
        events?: unknown;
    }>;
    /** `POST /search` — semantic search over stored memories. */
    search(options: Mem0SearchOptions): Promise<{
        results?: Mem0Memory[];
    }>;
    /** `GET /memories` — list memories, optionally scoped to identifiers. */
    list(options?: Mem0ListOptions): Promise<{
        results?: Mem0Memory[];
    }>;
    /** `GET /memories/{id}` — one memory. */
    get(id: string): Promise<Mem0Memory>;
    /** `PUT /memories/{id}` — update a memory's text / metadata / expiration. */
    update(id: string, options: Mem0UpdateOptions): Promise<unknown>;
    /** `DELETE /memories/{id}` — delete one memory. */
    remove(id: string): Promise<{
        message?: string;
    }>;
    /** `DELETE /memories` — delete all memories for an identifier (admin role). */
    removeAll(options: Mem0Filters): Promise<{
        message?: string;
    }>;
    /** `GET /memories/{id}/history` — full edit history of one memory (bare array). */
    history(id: string): Promise<Mem0HistoryEntry[]>;
    /** `POST /reset` — wipe all memories (admin role). */
    reset(): Promise<{
        message?: string;
    }>;
    /** `GET /configure` — current memory configuration (keys redacted upstream). */
    configure(): Promise<unknown>;
    /** Open health probe: `GET /auth/setup-status` never requires auth. */
    setupStatus(): Promise<{
        needsSetup?: boolean;
    } | null>;
    /**
     * Connection + auth check used by `mem0_status`:
     * probe the open route, then (when an API key is configured) the
     * authenticated /configure route. Returns a compact, safe summary.
     */
    status(): Promise<{
        reachable: boolean;
        setupStatus: {
            needsSetup?: boolean;
        } | null;
        authenticated: boolean;
        authError?: string;
        configure?: unknown;
    }>;
}
