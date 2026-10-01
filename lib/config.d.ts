/**
 * Plugin configuration: the settings section the web GUI edits and the
 * values the mem0 REST client resolves on every request. Persisted by the
 * dsh settings provider (no hand-rolled store file needed).
 */
import z from '@deepseek-ai/schemastery';
/**
 * Settings namespace of the mem0 capability — the profile entry id the
 * settings surface edits. dsh 0.2 derives it from the plugin row's `id`
 * (`entry.options.id`), so it is a plain string here; the branded
 * `settingsNamespace()` helper was removed in 0.2.0-rc.2.
 */
export declare const MEM0_SETTINGS_NAMESPACE = "dsh-mem0";
/**
 * Lossless JSON value. dsh 0.2 moved `JsonValue` out of `@deepseek-ai/dsh-session`
 * into `@deepseek-ai/dsh-util-values`, which rides the harness bundle row — the
 * installability rule forbids depending on a bundle-row package, so the type is
 * declared here (it is structural and `import type`-only, i.e. zero runtime cost).
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
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
/**
 * Schemastery schema, validated + persisted by the dsh settings provider.
 *
 * No `z<Mem0Config>` annotation: `.volatile()` widens each field's output type
 * to `Volatile<T>`, which cannot satisfy `Mem0Config`. Inference is what the
 * harness's own plugins use for volatile Config schemas, and `resolveConfig`
 * below still normalizes whatever the loader hands `apply` into `Mem0Config`.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    baseUrl: z<string, string, "volatile-defined">;
    apiKey: z<string, string, "volatile-defined">;
    authType: z<"apiKey" | "adminKey" | "jwt" | "none", "apiKey" | "adminKey" | "jwt" | "none", "volatile-defined">;
    defaultUserId: z<string, string, "volatile-defined">;
    defaultAgentId: z<string, string, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    announceToAgent: z<boolean, boolean, "volatile-defined">;
    enabled: z<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    baseUrl: z<string, string, "volatile-defined">;
    apiKey: z<string, string, "volatile-defined">;
    authType: z<"apiKey" | "adminKey" | "jwt" | "none", "apiKey" | "adminKey" | "jwt" | "none", "volatile-defined">;
    defaultUserId: z<string, string, "volatile-defined">;
    defaultAgentId: z<string, string, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    announceToAgent: z<boolean, boolean, "volatile-defined">;
    enabled: z<boolean, boolean, "volatile-defined">;
}>>, "plain">;
/** Schema defaults, re-read for hand-built test contexts (the loader applies them normally). */
export declare const DEFAULT_CONFIG: Required<Mem0Config>;
/** Normalize a partial config against the defaults. */
export declare function resolveConfig(input: Mem0Config | undefined): Required<Mem0Config>;
