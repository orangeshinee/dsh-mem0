/**
 * /api/dsh-mem0/config — the configuration card's read/write path.
 *
 * Why a plugin-owned route instead of the settings RPC: the harness's
 * `settings.*` wire only exposes namespaces on a hard-coded allowlist
 * (`WEB_SETTINGS_NAMESPACES` + model providers + product namespaces in
 * dsh-host-apiproxy); a plugin cannot widen it without patching dsh source.
 * The namespace IS registered host-side, so this plugin serves its own
 * loopback-only endpoints that read/write it through the settings service.
 *
 *   GET  /api/dsh-mem0/config -> redacted view (value/base/user/writable/
 *                                revision, apiKey as a configured flag)
 *   POST /api/dsh-mem0/config -> { set?: {field: value}, unset?: [field] }
 *                                applies a validated write, returns the new view
 *
 * Every response is redacted: the apiKey literal never leaves the host.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
/**
 * Structural stand-in for `@deepseek-ai/dsh-host-webserver`'s WebRoute, kept
 * local so the plugin needs no build-time dependency on the webserver package
 * (the host resolves it at runtime from the profile). Matches the published
 * contract exactly: kind / path / handler.
 */
export interface WebRoute {
    kind: 'exact' | 'prefix';
    /** Absolute pathname, no trailing slash. */
    path: string;
    /** Owns the full response lifecycle. */
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}
/** The single route family path. */
export declare const CONFIG_ROUTE = "/api/dsh-mem0/config";
/**
 * Build the config routes.
 * @param ctx - the host plugin context (read live at request time, so a save
 * is immediately reflected in the tools through the settings scope).
 * @returns the route family.
 */
export declare function makeSettingsRoutes(ctx: Context): WebRoute[];
