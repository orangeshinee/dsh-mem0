# AGENTS.md — dsh-mem0 开发须知

> 给 AI agent（和人类协作者）的项目内指南。README 讲「怎么用」，本文件讲「怎么改」：
> 代码地图、构建/验证闭环、以及几条违反就会白费功夫的平台陷阱。改动前先读完「平台陷阱」。

## 这是什么

dsh 的热插拔插件：宿主 Agent 通过 `mem0_*` 工具读写自托管 mem0 REST 服务，并在
web 设置面板提供配置卡片。**硬约束：不修改 dsh/harness 源码**，一切能力都从本包内实现。

## 代码地图

| 路径 | 职责 | 半边 |
|---|---|---|
| `src/index.ts` | 插件入口：注册工具 + 系统提示段 + 设置命名空间 + 配置路由 | 宿主 |
| `src/config.ts` | 配置 schema（schemastery）、默认值、`MEM0_SETTINGS_NAMESPACE` | 宿主 |
| `src/mem0-client.ts` | mem0 REST 客户端（每次请求读实时配置） | 宿主 |
| `src/tools.ts` | 8 个 `mem0_*` 工具定义 | 宿主 |
| `src/settings-routes.ts` | `/api/dsh-mem0/config` 路由（配置卡片的读写通道） | 宿主 |
| `client/client.cjs` | 浏览器半边：设置面板配置卡片（**手写纯 JS bundle，非构建产物**） | 浏览器 |
| `cordis.patch.yml` | 把插件行插入 web profile 清单 | 装配 |
| `scripts/smoke-client.mjs` | 浏览器半边冒烟（VM + 假路由） | 测试 |
| `scripts/smoke-routes.mjs` | 宿主路由冒烟（假 settings 服务） | 测试 |
| `scripts/smoke.mjs` / `load-test.mjs` / `migrate-user-id.mjs` | 真机 E2E / apply 冒烟 / 数据迁移（凭据走环境变量，见安全红线） | 测试 |
| `lib/` | `pnpm build` 的 tsc 产物，**纳入 git**（link 挂载直接加载它） | 产物 |

## 构建与验证（每次改动必跑）

```sh
pnpm build          # tsc 输出 lib/ + 类型检查（必须通过）
pnpm smoke:client   # 浏览器半边：bundle 加载 + 表单暂存/保存/放弃
pnpm smoke:routes   # 宿主路由：脱敏 / 字段白名单 / loopback 围栏 / set+unset
pnpm smoke:apply    # 宿主 apply 冒烟：8 工具 + 提示段注册（scripts/load-test.mjs）
pnpm smoke:tools    # 工具输出 schema 冒烟：真实服务器形状载荷必须通过（scripts/smoke-tools.mjs）
```

- 改了 `src/**` → `pnpm build`，且 **dsh web 进程要重启**才生效（宿主代码启动时加载）。
- 只改了 `client/client.cjs` → 刷新页面即生效（该文件按请求现读，rev 仅作缓存破坏）。
- 改了 `package.json` 的 `dsh.client` 声明或新增路由 → 同样需要重启（启动时编排清单）。
- 冒烟测试用假对象/VM，不碰真实 mem0 数据；`scripts/smoke.mjs` 才打真实实例（用独立
  `dsh-mem0-test` 用户并自清理）。

## 架构：两个半边 + 一条路由

- **宿主半边**（`src/`）注册设置命名空间（`installSettingsSection`）、8 个工具、系统提示段。
  工具经 `resolve()` 每次请求读实时配置 → 设置改动即时生效，无需重启。
- **浏览器半边**（`client/client.cjs`）只做一件事：在设置面板注册 `settings.plugin.item`
  卡片。卡片不直接依赖宿主工具，只读写配置。
- **配置通道**：卡片 → `GET/POST /api/dsh-mem0/config`（宿主路由）→ `ctx.settings` 服务。
  卡片内的 `RouteScope` 实现与官方 `settingsScope` 相同的 `getSnapshot/subscribe/set/unset`
  表面，所以表单模型与官方卡片同构，只是传输层换成了自有路由。

## 平台陷阱（最重要，违反必踩坑）

1. **settings 线上通道有硬编码白名单**。dsh 的 `settings.*` RPC（`dsh-host-apiproxy`）只
   暴露 `WEB_SETTINGS_NAMESPACES` + 模型提供方 + 产品命名空间；插件**无法**把自己命名空间
   加进去（harness 源码注释明说这是 deferred work）。所以配置卡片不能走 `settings.describe`，
   必须走插件自有的 `/api/dsh-mem0/config` 路由。**不要**试图通过注册命名空间让卡片可见——
   没用。宿主侧 `installSettingsSection` 照常注册（工具读得到），只是浏览器 RPC 读不到。
2. **`ctx.get` 严格模式会漏**。本插件 `inject` 只有 `['tools','systemPrompt']`，激活很早，
   早于 `webServer`/`settings` 提供者纤维达到 ACTIVE。此时 `ctx.get(name)`（严格）返回
   `undefined`，`ctx.get(name, false)`（loose）才拿得到。路由注册和路由内读 settings 都必须
   用 loose get。**未声明在 `inject` 里的服务用属性访问（`ctx.webServer`）会直接抛错**
   （"cannot get property without inject"）——要么声明进 inject，要么用 `ctx.get(name, false)`。
3. **客户端 bundle 格式**。`client/client.cjs` 是 `window.__ModuleLoader__.load({ id:
   'dsh-mem0', factory })` 格式的手写纯 JS（无 TS/JSX/import），factory 返回
   `{ apply, inject }`。只能 `require` 平台模块：`react`、
   `@deepseek-ai/dsh-client-runtime/client`（`createSnapshotStore`）。浏览器半边
   `inject = ['slots', 'locale', 'remote']`。改它时保持该格式，别引入打包器依赖。
4. **`role('secret')` 的脱敏边界**。`apiKey` 在 schema 上标记 secret；`describe({ redactSecrets:
   true })` 会从 value/base/user 三层剥离它，只给 `secrets:[{path,set}]`。脱敏 walker 只沿
   object/dict/array 容器走——secret 放在 union/transform 里会被原样下发。新增敏感字段时保持
   plain 字段 + `role('secret')`。
5. **`settings.yaml` 里 apiKey 是明文**（dsh settings 提供者的设计）。卡片只显示「已配置/
   未配置」，密钥字面量不下发浏览器；但文件本身含密钥，注意权限与备份。

## mem0 服务端怪癖（写客户端时别踩）

- OSS 构建端点**无 `/v1` 前缀**（那是托管平台才有）；路径直接挂在 `baseUrl` 下。
- 服务端**默认把中文事实翻译成英文存储** → 中文语义搜索命中率低；提示词与测试里都建议
  英文关键词复搜。
- **搜索必须按标识符范围**（`user_id` 等），无过滤全局搜索被拒（400）。
- `GET /memories/{id}/history` 返回**裸数组**（不是 `{results:[]}`）。
- 批量删除 / reset 需要 admin 角色 + 明确 confirm 词。
- `mem0_get all=true` 跨标识符列举需要 admin key。
- **序列化行（`_serialize_memory`）形状**：恒有 `hash` / `attributed_to`，新行有 `role`，
  `expiration_date` 常以 null 存在，且 `metadata` / `run_id` / `agent_id` / `created_at` /
  `updated_at` 在旧行上可能是 null。**工具输出 schema 必须容忍这些**（`MEMORY_ROW_SCHEMA`：
  `additionalProperties:true` + 可空字段用 `oneOf:[{type:'x'},{type:'null'}]`）——严格 schema
  会让整个读路径被 harness 的输出校验拦死（ToolOutputError「invalid output」）。回归保障：
  `pnpm smoke:tools`。注意 dsh-tools 的 JSON Schema 子集**不支持 `type` 数组**（如
  `['string','null']`），可空必须用 oneOf。

## 安全红线

- **凭据一律从环境变量读取，禁止硬编码**。真机脚本 `scripts/smoke.mjs` 和
  `migrate-user-id.mjs` 需要 `MEM0_API_KEY` + `MEM0_BASE_URL`（缺失即退出并提示）；
  `migrate-user-id.mjs` 是**重建+删除**的破坏性脚本，还额外要求 `MIGRATE_CONFIRM=yes`
  才执行。本地可用 `.env` 存放这些值（已在 `.gitignore`），**任何密钥都不进 git**。
- **历史密钥已清除**：2026-08 用 `git filter-repo` 重写过全部历史（旧 apiKey 与内网地址
  已替换为 `***REMOVED***`，reflog/gc 已深度清理）。旧密钥仍视为可能泄露——不要复用到别处，
  尽快在 mem0 dashboard 轮换。
- 配置路由是 **loopback-only**（`isLoopbackRequest` 围栏，同源校验）——执行写入的端点不能
  对 LAN 开放。新增路由必须带同样的围栏。
- 破坏性工具（删除/清空）先展示目标再执行，工具描述里已写明 confirm 要求，别弱化。
- 工具输出不含 apiKey（`mem0_status` 只报认证状态）。

## 约定

- **`lib/` 提交进 git**：link 挂载直接跑它，克隆仓库即可用；改 `src/` 后必须 `pnpm build`
  并连同 `lib/` 一起提交，否则线上跑的是旧码。
- **可安装性规则（`dsh plugin add`）**：profile 默认 `autoInstallPeers:false`，peerDependencies
  不会被装——**运行时导入的包必须是 `dependencies`**（当前：`@deepseek-ai/dsh-settings`、
  `@deepseek-ai/schemastery`，用 scoped 版而非裸 `schemastery`，后者不在任何全局解析路径上）；
  但**凡是 harness bundle 行的包（如 `@deepseek-ai/dsh-tools` 的 `tools`
  行）绝不能做依赖**：会被 hoist 进 profile、遮蔽 harness 副本，两份模块产生两个
  `TOOL_RUNTIME_SCHEDULER` Symbol，导致每次工具调用报 "Cannot read properties of undefined
  (reading 'prepare')"。这类包只能 `import type`（tools 定义已改为手写 JSON Schema，零运行时
  导入）。新增运行时导入时保持这条规则，并确认版本在 npm registry 可获取。
- 工具/路由的注册与释放都挂在 `ctx.effect` 上（可逆副作用），新增面同样处理。
- 路由文件保持「每路径一个 handler + 方法内分派」的结构（对齐 `dsh-ssh` 的 route 家族）。
- 提示词文案（`MEM0_GUIDANCE`）是中文，面向模型；改配置默认值时同步改 README 表格。
- 宿主 `src/` 用 TS（`strict`）；浏览器 `client/client.cjs` 是纯 JS 且不参与类型检查——它的
  回归保障是 `pnpm smoke:client`，别绕过。
