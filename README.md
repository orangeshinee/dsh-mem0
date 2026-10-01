# dsh-mem0

中文 | [English](README.en.md)

自托管 [mem0](https://github.com/mem0ai/mem0) 记忆读写的 [dsh](https://github.com/deepseek-ai/deepseek-harness)（DeepSeek Harness）插件：宿主 Agent 通过
`mem0_*` 工具直接读写你自己的 mem0 REST 服务（新版 OSS 构建，`mem0/mem0-api-server`，
带 dashboard，`X-API-Key` 认证，端点无 `/v1` 前缀）。

热插拔：通过 `dsh plugin add link:<本目录>` 挂载，不改 dsh 源码。无侧边栏 UI，但带一个
浏览器端配置页：**设置 → 插件 → dsh-mem0 行 → 「配置」**，可编辑下面的配置项。

## 工具

| 工具 | 端点 | 说明 |
|---|---|---|
| `mem0_add` | `POST /memories` | 写入记忆（字符串或消息数组；默认按 `defaultUserId` / `defaultAgentId` 归类） |
| `mem0_search` | `POST /search` | 语义搜索，带相关性分数 |
| `mem0_get` | `GET /memories` / `GET /memories/{id}` | 读取列表（按标识符过滤）或单条 |
| `mem0_update` | `PUT /memories/{id}` | 更新记忆文本 / metadata / 过期时间 |
| `mem0_delete` | `DELETE /memories/{id}` / `DELETE /memories` | 删除单条；批量删除需 `confirm: "DELETE ALL"` + admin |
| `mem0_history` | `GET /memories/{id}/history` | 单条记忆的变更历史 |
| `mem0_reset` | `POST /reset` | 清空全部（需 `confirm: "RESET"` + admin） |
| `mem0_status` | `GET /auth/setup-status` + `GET /configure` | 健康检查 / 认证状态 / 配置（不输出 apiKey） |

## 安装

先确认你用的是哪个 profile —— **装错 profile 插件完全不会加载，且没有任何报错**。
桌面版 GUI 跑的是 `desktop`：

```sh
# 桌面版（Electron GUI）：看进程命令行里的 profiles 路径确认
dsh plugin --profile desktop add link:/path/to/dsh-mem0

# 或者 CLI/web 版
dsh plugin --profile web add link:/path/to/dsh-mem0
```

各安装方式：

```sh
# 方式一：直接从 GitHub 安装（无需发布，推荐给使用者）
dsh plugin --profile desktop add github:orangeshinee/dsh-mem0

# 方式一（指定版本）：对应 GitHub Releases 的 v* 标签，CI 自动打包
dsh plugin --profile desktop add github:orangeshinee/dsh-mem0#v0.2.1

# 方式二：npm 发布后安装（维护者先 npm publish 一次）
npm publish   # 维护者操作
dsh plugin --profile desktop add dsh-mem0

# 方式三：本地开发（link 方式）
dsh plugin --profile desktop add link:$(pwd)

# 装完重启 dsh 生效
```

> 宿主端配了 0.2 的 settings 服务时，还需把运行时依赖装进同一个 profile（`dsh plugin add`
> 会随包安装 `dependencies`，但 profile 里若缺 harness 侧的 `dsh-settings` 需补齐）：
> `dsh plugin --profile desktop add '@deepseek-ai/dsh-settings@^0.2.0-rc.2'`。

## 发布

打 `v*` 标签即触发 CI（`.github/workflows/release.yml`）自动构建并发布 GitHub Release：
`pnpm build` → 四项离线冒烟 → `npm pack` 产物（`dsh-mem0-<version>.tgz`）挂到 Release，
并自动生成 changelog。

```sh
git tag v0.2.1 && git push origin v0.2.1
```

标签版本必须与 `package.json` 的 `version` 一致（不一致 CI 会失败）；若仓库设置了
`NPM_TOKEN` secret，还会同步 `npm publish` 到 npm（未设置则跳过，不影响 Release）。

运行时依赖（`@deepseek-ai/dsh-settings` / `@deepseek-ai/schemastery`）已列为
硬依赖，`dsh plugin add` 会随包安装（profile 默认 `autoInstallPeers:false`，peerDependencies
不会被装）。

## 配置

配置入口：**设置 → 插件 → dsh-mem0 行 → 「配置」**（或在 profile 的 patch 层里写 config 段）：

| 键 | 默认 | 说明 |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:8888` | 自部署 mem0 地址（无尾斜杠、无 `/v1`） |
| `apiKey` | 空 | dashboard「API Keys」创建的 `m0sk_...`，或 legacy `ADMIN_API_KEY`，或 JWT |
| `authType` | `apiKey` | `apiKey` / `adminKey` / `jwt` / `none` |
| `defaultUserId` | `HeTony` | 工具未指定 `user_id` 时的默认归属 |
| `defaultAgentId` | `dsh-agent` | 工具未指定 `agent_id` 时的默认归属 |
| `timeoutMs` | `15000` | 单请求超时 |
| `announceToAgent` | `true` | 是否向 Agent 宣告插件能力 |
| `enabled` | `true` | 总开关 |

配置经 dsh settings provider 持久化；`baseUrl` / `apiKey` / 默认标识符的修改即时生效，
无需重启。

> 配置卡片由浏览器端提供（`client/client.cjs`），通过插件自带的
> `/api/dsh-mem0/config` 路由（`src/settings-routes.ts`）读写配置——harness 的
> settings 线上通道只开放白名单内的命名空间，插件无法自行加入。`apiKey` 在 schema 上
> 标记为 `role('secret')`：路由只下发「已配置/未配置」标记，密钥字面量不会进入浏览器。
> 修改宿主端代码（`src/`）后需重新 `pnpm build` 并重启 dsh；仅改 `client/client.cjs`
> 刷新页面即可。
>
> 槽位说明：dsh 0.2 的插件配置入口是 `plugins.row.config`（keyed `<包名>#<行 id>`），
> 注册后该行才会出现「配置」按钮。0.1.x 用的旧槽位 `settings.plugin.item` 在 0.2 已移除。

## 故障排查

| 症状 | 原因与处理 |
|---|---|
| 插件装好了，但**没有任何 `mem0_*` 工具** | 多半装错了 profile。桌面版 GUI 跑的是 `desktop`，不是 `web`：用 `dsh plugin --profile desktop list` 核对，装错会**完全静默**。改完 profile 后需重启 dsh |
| 「插件」页能看到 dsh-mem0，但**没有「配置」入口** | dsh 0.2 的配置入口是 `plugins.row.config` 槽位（keyed `<包名>#<行 id>`）。确认 `cordis.patch.yml` 的行 `id`、`src/config.ts` 的命名空间、`client/client.cjs` 的 key 三处一致（本插件均为 `dsh-mem0`） |
| 工具调用报 `... .replace is not a function` | dsh 0.2 的 `.volatile()` 配置字段是 `Volatile<T>` 引用对象而非裸值，须 `.get()` 取值。本插件已在 `resolveConfig` 中解包；若自行改动该函数请保留解包逻辑 |
| `mem0_status` 报 `auth: not authenticated` | 未配 `apiKey`。在配置页填入 dashboard 创建的 `m0sk_...` |
| 工具报连接失败 | `baseUrl` 不对。确认地址与端口，且**不要**带 `/v1` 前缀（OSS 构建的端点没有该前缀） |
| 首次调用超时 | mem0 依赖链（LLM / embedder）冷启动较慢，重试即可，或调大 `timeoutMs` |

## 开发

```sh
pnpm typecheck   # tsc --noEmit
pnpm build       # 输出 lib/（ESM，源码在 src/）
```

构建产物为多文件 ESM（`tsc`），运行时依赖（`@deepseek-ai/dsh-*`）从宿主 profile 的
`node_modules` 解析。

面向 AI agent 的开发说明（代码地图、平台陷阱、安全红线）见 [AGENTS.md](AGENTS.md)。

## License

[MIT](LICENSE)
