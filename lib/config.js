/**
 * Plugin configuration: the settings section the web GUI edits and the
 * values the mem0 REST client resolves on every request. Persisted by the
 * dsh settings provider (no hand-rolled store file needed).
 */
import z from 'schemastery';
/** Schemastery schema, validated + persisted by the dsh settings provider. */
export const Config = z.object({
    baseUrl: z.string().default('http://127.0.0.1:8888'),
    apiKey: z.string().default(''),
    authType: z
        .union([z.const('apiKey'), z.const('adminKey'), z.const('jwt'), z.const('none')])
        .default('apiKey'),
    defaultUserId: z.string().default('Tony'),
    defaultAgentId: z.string().default('dsh-agent'),
    timeoutMs: z.number().default(15000),
    announceToAgent: z.boolean().default(true),
    enabled: z.boolean().default(true),
});
/** Schema defaults, re-read for hand-built test contexts (the loader applies them normally). */
export const DEFAULT_CONFIG = {
    baseUrl: 'http://127.0.0.1:8888',
    apiKey: '',
    authType: 'apiKey',
    defaultUserId: 'Tony',
    defaultAgentId: 'dsh-agent',
    timeoutMs: 15000,
    announceToAgent: true,
    enabled: true,
};
/** Normalize a partial config against the defaults. */
export function resolveConfig(input) {
    const value = input ?? {};
    return {
        baseUrl: value.baseUrl ?? DEFAULT_CONFIG.baseUrl,
        apiKey: value.apiKey ?? DEFAULT_CONFIG.apiKey,
        authType: value.authType ?? DEFAULT_CONFIG.authType,
        defaultUserId: value.defaultUserId ?? DEFAULT_CONFIG.defaultUserId,
        defaultAgentId: value.defaultAgentId ?? DEFAULT_CONFIG.defaultAgentId,
        timeoutMs: value.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
        announceToAgent: value.announceToAgent ?? DEFAULT_CONFIG.announceToAgent,
        enabled: value.enabled ?? DEFAULT_CONFIG.enabled,
    };
}
