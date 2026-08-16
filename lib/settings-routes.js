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
import { MEM0_SETTINGS_NAMESPACE } from './config.js';
/** The single route family path. */
export const CONFIG_ROUTE = '/api/dsh-mem0/config';
/** Fields the card may edit; anything else is rejected at the wire. */
const ALLOWED_FIELDS = new Set([
    'baseUrl',
    'apiKey',
    'authType',
    'defaultUserId',
    'defaultAgentId',
    'timeoutMs',
    'announceToAgent',
    'enabled',
]);
/** Cap on JSON request bodies (the config is tiny). */
const MAX_JSON_BODY_BYTES = 32 * 1024;
/** Loopback literal check plus browser same-origin markers (mirrors the dsh-ssh route fence). */
function isLoopbackRequest(request) {
    const address = request.socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1')
        return false;
    const host = request.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostUrl;
    try {
        hostUrl = new URL(`http://${host}`);
    }
    catch {
        return false;
    }
    if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]')
        return false;
    if (request.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = request.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
/** One JSON response. */
function writeJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'referrer-policy': 'no-referrer',
    });
    res.end(payload);
}
/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        size += buffer.length;
        if (size > MAX_JSON_BODY_BYTES)
            return undefined;
        chunks.push(buffer);
    }
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
/** The redacted wire view of the namespace, or the unavailable shape. */
function viewOf(ctx) {
    const settings = ctx.get('settings');
    if (settings === undefined) {
        return { status: 'unavailable', writable: false };
    }
    const descriptor = settings
        .describe({ redactSecrets: true })
        .find((candidate) => String(candidate.ns) === MEM0_SETTINGS_NAMESPACE);
    if (descriptor === undefined) {
        return { status: 'unavailable', writable: settings.writable };
    }
    const keyConfigured = (descriptor.secrets ?? []).some((secret) => secret.path.length === 1 && secret.path[0] === 'apiKey' && secret.set);
    return {
        status: 'ready',
        value: descriptor.value,
        ...(descriptor.base === undefined ? {} : { base: descriptor.base }),
        ...(descriptor.user === undefined ? {} : { user: descriptor.user }),
        writable: settings.writable,
        revision: descriptor.revision,
        apiKeyConfigured: keyConfigured,
    };
}
/**
 * Build the config routes.
 * @param ctx - the host plugin context (read live at request time, so a save
 * is immediately reflected in the tools through the settings scope).
 * @returns the route family.
 */
export function makeSettingsRoutes(ctx) {
    return [
        {
            kind: 'exact',
            path: CONFIG_ROUTE,
            handler: async (req, res) => {
                if (!isLoopbackRequest(req)) {
                    writeJson(res, 403, { error: 'forbidden: loopback-only' });
                    return;
                }
                const method = req.method ?? 'GET';
                if (method === 'GET') {
                    writeJson(res, 200, viewOf(ctx));
                    return;
                }
                if (method !== 'POST') {
                    writeJson(res, 405, { error: `method not allowed: ${method}` });
                    return;
                }
                const settings = ctx.get('settings');
                if (settings === undefined) {
                    writeJson(res, 503, { error: 'settings service is absent in this deployment' });
                    return;
                }
                const body = await readJsonBody(req);
                if (body === undefined) {
                    writeJson(res, 400, { error: 'invalid JSON body' });
                    return;
                }
                const set = body.set;
                const unset = body.unset;
                if (set !== undefined && (typeof set !== 'object' || set === null || Array.isArray(set))) {
                    writeJson(res, 400, { error: '"set" must be an object of field -> value' });
                    return;
                }
                if (unset !== undefined && (!Array.isArray(unset) || unset.some((f) => typeof f !== 'string'))) {
                    writeJson(res, 400, { error: '"unset" must be an array of field names' });
                    return;
                }
                const setPatch = {};
                for (const [field, value] of Object.entries((set ?? {}))) {
                    if (!ALLOWED_FIELDS.has(field)) {
                        writeJson(res, 400, { error: `unknown config field "${field}"` });
                        return;
                    }
                    setPatch[field] = value;
                }
                const unsetOps = [];
                for (const field of (unset ?? [])) {
                    if (!ALLOWED_FIELDS.has(field)) {
                        writeJson(res, 400, { error: `unknown config field "${field}"` });
                        return;
                    }
                    unsetOps.push({ op: 'unset', path: [field] });
                }
                if (Object.keys(setPatch).length === 0 && unsetOps.length === 0) {
                    writeJson(res, 200, viewOf(ctx));
                    return;
                }
                try {
                    if (Object.keys(setPatch).length > 0) {
                        await settings.update(MEM0_SETTINGS_NAMESPACE, setPatch);
                    }
                    if (unsetOps.length > 0) {
                        await settings.mutate(MEM0_SETTINGS_NAMESPACE, unsetOps);
                    }
                }
                catch (error) {
                    writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
                    return;
                }
                writeJson(res, 200, viewOf(ctx));
            },
        },
    ];
}
