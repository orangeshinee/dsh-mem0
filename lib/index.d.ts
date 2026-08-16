/**
 * dsh-mem0: self-hosted mem0 memory operations for dsh.
 *
 * Host-side cordis plugin. Mounts a mem0 REST client configured through the
 * dsh settings section (baseUrl / apiKey / authType / default identifiers),
 * registers the mem0_* agent tools, announces itself to agents via a
 * system-prompt section, and serves the /api/dsh-mem0/config route family
 * that the browser-half settings card reads and writes (the harness settings
 * wire only exposes namespaces on its own allowlist).
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Mem0Config } from './config.js';
/** Stable cordis plugin name. */
export declare const name = "mem0";
/** Services required before the mem0 surfaces can mount. */
export declare const inject: string[];
/** Settings namespace of the mem0 capability (the section the web settings surface edits). */
export { MEM0_SETTINGS_NAMESPACE } from './config.js';
/** Model-facing announcement: plugin presence, capabilities, and limits. */
export declare const MEM0_GUIDANCE: string;
/**
 * Mount the mem0 client, tools, and announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export declare function apply(ctx: Context, config?: Mem0Config): void;
