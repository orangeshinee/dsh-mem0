# dsh-mem0

自托管 [mem0](https://github.com/mem0ai/mem0) 记忆读写的 dsh 插件：宿主 Agent 通过
`mem0_*` 工具直接读写你自己的 mem0 REST 服务（新版 OSS 构建，`mem0/mem0-api-server`，
带 dashboard，`X-API-Key` 认证，端点无 `/v1` 前缀）。

热插拔：通过 `dsh plugin add link:<本目录>` 挂载，不改 dsh 源码。无侧边栏 UI，但带一个
浏览器端：在设置面板 → 插件 → 插件配置里提供 `dsh-mem0` 配置卡片（编辑下面的配置项）。

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

```sh
# 在 dsh-mem0 目录构建
pnpm install && pnpm build

# 挂载到 web profile（link 方式，本地开发）
dsh plugin --profile web add link:$(pwd)

# 重启 dsh web 生效
```

## 配置

设置面板 → 插件 → 插件配置 → `dsh-mem0`（或插件构成里的 config 段）：

| 键 | 默认 | 说明 |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:8888` | 自部署 mem0 地址（无尾斜杠、无 `/v1`） |
| `apiKey` | 空 | dashboard「API Keys」创建的 `m0sk_...`，或 legacy `ADMIN_API_KEY`，或 JWT |
| `authType` | `apiKey` | `apiKey` / `adminKey` / `jwt` / `none` |
| `defaultUserId` | `dsh-user` | 工具未指定 `user_id` 时的默认归属 |
| `defaultAgentId` | `dsh-agent` | 工具未指定 `agent_id` 时的默认归属 |
| `timeoutMs` | `15000` | 单请求超时 |
| `announceToAgent` | `true` | 是否向 Agent 宣告插件能力 |
| `enabled` | `true` | 总开关 |

配置经 dsh settings provider 持久化；`baseUrl` / `apiKey` / 默认标识符的修改即时生效，
无需重启。

> 插件配置卡片由浏览器端提供（`client/client.js`），通过插件自带的
> `/api/dsh-mem0/config` 路由（`src/settings-routes.ts`）读写配置——harness 的
> settings 线上通道只开放白名单内的命名空间，插件无法自行加入。`apiKey` 在 schema 上
> 标记为 `role('secret')`：路由只下发「已配置/未配置」标记，密钥字面量不会进入浏览器。
> 修改宿主端代码（`src/`）后需重新 `pnpm build` 并重启 dsh web；仅改 `client/client.js`
> 刷新页面即可。

## 开发

```sh
pnpm typecheck   # tsc --noEmit
pnpm build       # 输出 lib/（ESM，源码在 src/）
```

构建产物为多文件 ESM（`tsc`），运行时依赖（`@deepseek-ai/dsh-*`）从宿主 profile 的
`node_modules` 解析。
