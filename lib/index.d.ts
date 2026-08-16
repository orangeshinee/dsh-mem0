/**
 * dsh-mem0: self-hosted mem0 memory operations for dsh.
 *
 * Host-side cordis plugin. Mounts a mem0 REST client configured through the
 * dsh settings section (baseUrl / apiKey / authType / default identifiers),
 * registers the mem0_* agent tools, and announces itself to agents via a
 * system-prompt section. No browser half ships with this plugin.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Mem0Config } from './config.js';
/** Stable cordis plugin name. */
export declare const name = "mem0";
/** Services required before the mem0 surfaces can mount. */
export declare const inject: string[];
/**
 * Settings namespace of the mem0 capability — the section the web settings
 * surface edits. Spelled here rather than imported: no other half depends
 * on it (there is no browser half).
 */
export declare const MEM0_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Model-facing announcement: plugin presence, capabilities, and limits. */
export declare const MEM0_GUIDANCE: string;
/**
 * Mount the mem0 client, tools, and announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export declare function apply(ctx: Context, config?: Mem0Config): void;
