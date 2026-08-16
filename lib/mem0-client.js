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
/** Error thrown when the mem0 server answers non-2xx or the request fails. */
export class Mem0ApiError extends Error {
    status;
    detail;
    method;
    path;
    constructor(message, status, detail, method, path) {
        super(message);
        this.status = status;
        this.detail = detail;
        this.method = method;
        this.path = path;
        this.name = 'Mem0ApiError';
    }
}
/** Client-side request timeout. */
export class Mem0TimeoutError extends Error {
    timeoutMs;
    constructor(timeoutMs) {
        super(`mem0 request timed out after ${timeoutMs} ms`);
        this.timeoutMs = timeoutMs;
        this.name = 'Mem0TimeoutError';
    }
}
/**
 * Fetch wrapper that reads the live config on every call, so settings edits
 * apply immediately without re-creating the client or the tools.
 */
export class Mem0Client {
    config;
    constructor(config) {
        this.config = config;
    }
    /** Current base URL (normalized, no trailing slash). */
    get baseUrl() {
        return (this.config().baseUrl ?? '').replace(/\/+$/, '');
    }
    authHeaders() {
        const value = this.config();
        const key = value.apiKey?.trim();
        if (!key)
            return {};
        switch (value.authType ?? 'apiKey') {
            case 'jwt':
                return { Authorization: `Bearer ${key}` };
            case 'none':
                return {};
            case 'adminKey':
            case 'apiKey':
            default:
                return { 'X-API-Key': key };
        }
    }
    async request(method, path, body, query) {
        const url = new URL(this.baseUrl + path);
        if (query) {
            for (const [key, raw] of Object.entries(query)) {
                if (raw !== undefined && raw !== null && raw !== '')
                    url.searchParams.set(key, String(raw));
            }
        }
        const timeoutMs = this.config().timeoutMs ?? 15000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...this.authHeaders(),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal,
            });
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError')
                throw new Mem0TimeoutError(timeoutMs);
            throw new Mem0ApiError(`mem0 request failed: ${error instanceof Error ? error.message : String(error)}`, undefined, undefined, method, path);
        }
        finally {
            clearTimeout(timer);
        }
        const text = await response.text().catch(() => '');
        let payload;
        try {
            payload = text === '' ? null : JSON.parse(text);
        }
        catch {
            payload = text;
        }
        if (!response.ok) {
            const detail = payload && typeof payload === 'object' && 'detail' in payload ? payload.detail : payload;
            const snippet = typeof detail === 'string' ? detail : JSON.stringify(detail ?? text ?? '');
            throw new Mem0ApiError(`mem0 ${method} ${path} -> ${response.status}${snippet ? `: ${snippet}` : ''}`, response.status, detail, method, path);
        }
        return payload;
    }
    /** `POST /memories` — store new memories. At least one identifier is required. */
    add(options) {
        return this.request('POST', '/memories', options);
    }
    /** `POST /search` — semantic search over stored memories. */
    search(options) {
        const { query, filters, top_k, threshold } = options;
        const body = { query };
        if (filters && Object.keys(filters).length > 0)
            body.filters = filters;
        if (top_k !== undefined)
            body.top_k = top_k;
        if (threshold !== undefined)
            body.threshold = threshold;
        return this.request('POST', '/search', body);
    }
    /** `GET /memories` — list memories, optionally scoped to identifiers. */
    list(options) {
        return this.request('GET', '/memories', undefined, {
            user_id: options?.user_id,
            agent_id: options?.agent_id,
            run_id: options?.run_id,
            top_k: options?.top_k,
        });
    }
    /** `GET /memories/{id}` — one memory. */
    get(id) {
        return this.request('GET', `/memories/${encodeURIComponent(id)}`);
    }
    /** `PUT /memories/{id}` — update a memory's text / metadata / expiration. */
    update(id, options) {
        const body = {};
        if (options.text !== undefined)
            body.text = options.text;
        if (options.metadata !== undefined)
            body.metadata = options.metadata;
        if (options.expiration_date !== undefined)
            body.expiration_date = options.expiration_date;
        if (Object.keys(body).length === 0) {
            throw new Mem0ApiError('mem0 update requires at least one of text / metadata / expiration_date', 400, undefined, 'PUT', `/memories/${id}`);
        }
        return this.request('PUT', `/memories/${encodeURIComponent(id)}`, body);
    }
    /** `DELETE /memories/{id}` — delete one memory. */
    remove(id) {
        return this.request('DELETE', `/memories/${encodeURIComponent(id)}`);
    }
    /** `DELETE /memories` — delete all memories for an identifier (admin role). */
    removeAll(options) {
        return this.request('DELETE', '/memories', undefined, {
            user_id: options.user_id,
            agent_id: options.agent_id,
            run_id: options.run_id,
        });
    }
    /** `GET /memories/{id}/history` — full edit history of one memory (bare array). */
    history(id) {
        return this.request('GET', `/memories/${encodeURIComponent(id)}/history`);
    }
    /** `POST /reset` — wipe all memories (admin role). */
    reset() {
        return this.request('POST', '/reset');
    }
    /** `GET /configure` — current memory configuration (keys redacted upstream). */
    configure() {
        return this.request('GET', '/configure');
    }
    /** Open health probe: `GET /auth/setup-status` never requires auth. */
    async setupStatus() {
        try {
            return await this.request('GET', '/auth/setup-status');
        }
        catch (error) {
            if (error instanceof Mem0ApiError && error.status === 404)
                return null;
            throw error;
        }
    }
    /**
     * Connection + auth check used by `mem0_status`:
     * probe the open route, then (when an API key is configured) the
     * authenticated /configure route. Returns a compact, safe summary.
     */
    async status() {
        let setupStatus = null;
        try {
            setupStatus = await this.setupStatus();
        }
        catch (error) {
            return {
                reachable: false,
                setupStatus: null,
                authenticated: false,
                authError: error instanceof Error ? error.message : String(error),
            };
        }
        let authenticated = false;
        let authError;
        let configure;
        if (this.config().apiKey) {
            try {
                configure = await this.configure();
                authenticated = true;
            }
            catch (error) {
                authError = error instanceof Error ? error.message : String(error);
            }
        }
        else {
            authError = 'no apiKey configured';
        }
        return { reachable: true, setupStatus, authenticated, authError, configure };
    }
}
