/**
 * Plugin configuration: the settings section the web GUI edits and the
 * values the mem0 REST client resolves on every request. Persisted by the
 * dsh settings provider (no hand-rolled store file needed).
 */
import z from 'schemastery';
/** Resolved runtime config (schema defaults applied by the loader). */
export interface Mem0Config {
    /** Base URL of the self-hosted mem0 REST server (no trailing slash, no /v1). */
    baseUrl?: string;
    /** API key for auth: a per-user `m0sk_...` key, the legacy `ADMIN_API_KEY`, or a JWT. */
    apiKey?: string;
    /** How `apiKey` is sent. `jwt` sends `Authorization: Bearer`, the rest send `X-API-Key`. */
    authType?: 'apiKey' | 'adminKey' | 'jwt' | 'none';
    /** Default `user_id` used when a tool call does not specify one. */
    defaultUserId?: string;
    /** Default `agent_id` used when a tool call does not specify one. */
    defaultAgentId?: string;
    /** HTTP timeout per request, in milliseconds. */
    timeoutMs?: number;
    /** When true (default), a system-prompt section announces the plugin to agents. */
    announceToAgent?: boolean;
    /** Master switch for tools and the prompt section. */
    enabled?: boolean;
}
/** Schemastery schema, validated + persisted by the dsh settings provider. */
export declare const Config: z<Mem0Config>;
/** Schema defaults, re-read for hand-built test contexts (the loader applies them normally). */
export declare const DEFAULT_CONFIG: Required<Mem0Config>;
/** Normalize a partial config against the defaults. */
export declare function resolveConfig(input: Mem0Config | undefined): Required<Mem0Config>;
