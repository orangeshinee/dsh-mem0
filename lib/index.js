/**
 * dsh-mem0: self-hosted mem0 memory operations for dsh.
 *
 * Host-side cordis plugin. Mounts a mem0 REST client configured through the
 * dsh settings section (baseUrl / apiKey / authType / default identifiers),
 * registers the mem0_* agent tools, and announces itself to agents via a
 * system-prompt section. No browser half ships with this plugin.
 */
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { Config, resolveConfig } from './config.js';
import { Mem0Client } from './mem0-client.js';
import { mem0AddTool, mem0DeleteTool, mem0GetTool, mem0HistoryTool, mem0ResetTool, mem0SearchTool, mem0StatusTool, mem0UpdateTool, } from './tools.js';
/** Stable cordis plugin name. */
export const name = 'mem0';
/** Services required before the mem0 surfaces can mount. */
export const inject = ['tools', 'systemPrompt'];
/**
 * Settings namespace of the mem0 capability — the section the web settings
 * surface edits. Spelled here rather than imported: no other half depends
 * on it (there is no browser half).
 */
export const MEM0_SETTINGS_NAMESPACE = settingsNamespace('dsh-mem0');
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 150;
/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const MEM0_GUIDANCE = '本机已安装 dsh-mem0 插件（自托管 mem0 记忆读写）：通过 dsh-mem0 工具读写自部署的 mem0 REST 服务。' +
    '能力：mem0_add 写入记忆（支持中文，自动以 user_id/agent_id 归类）；mem0_search 语义搜索；mem0_get 读取（按 id 或列表）；' +
    'mem0_update 更新；mem0_delete 删除（批量删除需 confirm: "DELETE ALL"）；mem0_history 查看历史；mem0_reset 清空（需 confirm: "RESET" 与 admin）；' +
    'mem0_status 健康检查。服务地址与 API key 在设置面板（插件配置 dsh-mem0）中配置，默认 user_id=HeTony / agent_id=dsh-agent；';
'mem0_get 传 all=true 可跨标识符列出全部记忆（含无 user_id 的 agent 库，需 admin key）；';
'mem0_search 需按标识符范围搜索（默认 HeTony），服务端不支持全局搜索。' +
    '注意：mem0 服务端默认会把中文事实翻译成英文存储，因此中文语义搜索可能命中率低——中文 query 无结果或结果差时，尝试用英文关键词或英文复述再搜。' +
    '限制：删除/清空为破坏性操作，执行前先展示目标并取得用户确认；apiKey 不会被输出。' +
    '用户提到「mem0 / 记忆 / 记住 / 写入记忆 / 搜索记忆 / 读取记忆 / 删除记忆 / 清空记忆」时即指本插件，请据此协作。';
/**
 * Mount the mem0 client, tools, and announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx, config) {
    // The live source the surfaces read: the settings section once the web
    // settings surface is served, the composition entry otherwise.
    let current = () => config ?? {};
    const resolve = () => resolveConfig(current());
    // The client reads the live config on every request, so settings edits
    // (baseUrl / apiKey / defaults) apply without re-registering the tools.
    const client = new Mem0Client(resolve);
    const tools = [
        mem0AddTool(client, resolve),
        mem0SearchTool(client, resolve),
        mem0GetTool(client, resolve),
        mem0UpdateTool(client),
        mem0DeleteTool(client, resolve),
        mem0HistoryTool(client),
        mem0ResetTool(client),
        mem0StatusTool(client),
    ];
    let disposeSection;
    let disposeTools;
    const sync = () => {
        if (disposeSection !== undefined) {
            disposeSection();
            disposeSection = undefined;
        }
        if (disposeTools !== undefined) {
            disposeTools();
            disposeTools = undefined;
        }
        const value = resolve();
        if (!value.enabled)
            return;
        if (value.announceToAgent) {
            disposeSection = ctx.systemPrompt.section({
                name: 'plugin:dsh-mem0',
                order: SECTION_ORDER,
                text: MEM0_GUIDANCE,
            });
        }
        disposeTools = ctx.effect(() => {
            const disposers = tools.map((tool) => ctx.tools.register(tool));
            return () => {
                for (const dispose of disposers)
                    dispose();
            };
        }, 'dsh-mem0: tools');
    };
    installSettingsSection(ctx, MEM0_SETTINGS_NAMESPACE, Config, config ?? {}, {
        setSource: (source) => {
            current = source;
            sync();
        },
        onChange: sync,
    });
    // Initial registration from the composition entry (covers deployments with
    // no settings service, whose installSettingsSection never fires its hooks).
    sync();
}
