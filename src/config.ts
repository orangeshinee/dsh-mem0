/**
 * Plugin configuration: the settings section the web GUI edits and the
 * values the mem0 REST client resolves on every request. Persisted by the
 * dsh settings provider (no hand-rolled store file needed).
 */

import z from '@deepseek-ai/schemastery'

/**
 * Settings namespace of the mem0 capability — the profile entry id the
 * settings surface edits. dsh 0.2 derives it from the plugin row's `id`
 * (`entry.options.id`), so it is a plain string here; the branded
 * `settingsNamespace()` helper was removed in 0.2.0-rc.2.
 */
export const MEM0_SETTINGS_NAMESPACE = 'dsh-mem0'

/**
 * Lossless JSON value. dsh 0.2 moved `JsonValue` out of `@deepseek-ai/dsh-session`
 * into `@deepseek-ai/dsh-util-values`, which rides the harness bundle row — the
 * installability rule forbids depending on a bundle-row package, so the type is
 * declared here (it is structural and `import type`-only, i.e. zero runtime cost).
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** Resolved runtime config (schema defaults applied by the loader). */
export interface Mem0Config {
  /** Base URL of the self-hosted mem0 REST server (no trailing slash, no /v1). */
  baseUrl?: string
  /** API key for auth: a per-user `m0sk_...` key, the legacy `ADMIN_API_KEY`, or a JWT. */
  apiKey?: string
  /** How `apiKey` is sent. `jwt` sends `Authorization: Bearer`, the rest send `X-API-Key`. */
  authType?: 'apiKey' | 'adminKey' | 'jwt' | 'none'
  /** Default `user_id` used when a tool call does not specify one. */
  defaultUserId?: string
  /** Default `agent_id` used when a tool call does not specify one. */
  defaultAgentId?: string
  /** HTTP timeout per request, in milliseconds. */
  timeoutMs?: number
  /** When true (default), a system-prompt section announces the plugin to agents. */
  announceToAgent?: boolean
  /** Master switch for tools and the prompt section. */
  enabled?: boolean
}

/**
 * Schemastery schema, validated + persisted by the dsh settings provider.
 *
 * No `z<Mem0Config>` annotation: `.volatile()` widens each field's output type
 * to `Volatile<T>`, which cannot satisfy `Mem0Config`. Inference is what the
 * harness's own plugins use for volatile Config schemas, and `resolveConfig`
 * below still normalizes whatever the loader hands `apply` into `Mem0Config`.
 */
export const Config = z.object({
  // `.volatile()` marks a field editable without remounting the plugin: dsh
  // 0.2's SettingsForms projects only volatile fields into the form
  // (`volatileForm`), so a field without it never reaches the settings UI.
  baseUrl: z.string().default('http://127.0.0.1:8888').volatile(),
  // role('secret'): redacted from every wire surface (the config route serves
  // only an apiKeyConfigured flag; the literal never reaches the browser).
  apiKey: z.string().role('secret').default('').volatile(),
  authType: z
    .union([z.const('apiKey'), z.const('adminKey'), z.const('jwt'), z.const('none')])
    .default('apiKey')
    .volatile(),
  defaultUserId: z.string().default('HeTony').volatile(),
  defaultAgentId: z.string().default('dsh-agent').volatile(),
  timeoutMs: z.number().default(15000).volatile(),
  announceToAgent: z.boolean().default(true).volatile(),
  enabled: z.boolean().default(true).volatile(),
})

/** Schema defaults, re-read for hand-built test contexts (the loader applies them normally). */
export const DEFAULT_CONFIG: Required<Mem0Config> = {
  baseUrl: 'http://127.0.0.1:8888',
  apiKey: '',
  authType: 'apiKey',
  defaultUserId: 'HeTony',
  defaultAgentId: 'dsh-agent',
  timeoutMs: 15000,
  announceToAgent: true,
  enabled: true,
}

/** Normalize a partial config against the defaults. */
export function resolveConfig(input: Mem0Config | undefined): Required<Mem0Config> {
  const value = input ?? {}
  return {
    baseUrl: value.baseUrl ?? DEFAULT_CONFIG.baseUrl,
    apiKey: value.apiKey ?? DEFAULT_CONFIG.apiKey,
    authType: value.authType ?? DEFAULT_CONFIG.authType,
    defaultUserId: value.defaultUserId ?? DEFAULT_CONFIG.defaultUserId,
    defaultAgentId: value.defaultAgentId ?? DEFAULT_CONFIG.defaultAgentId,
    timeoutMs: value.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
    announceToAgent: value.announceToAgent ?? DEFAULT_CONFIG.announceToAgent,
    enabled: value.enabled ?? DEFAULT_CONFIG.enabled,
  }
}
