# Affiliate / Redirect 管理（/go/[slug]）

本项目使用一个静态“中转跳转页”来统一管理所有 Provider 的外链（后续可随时切到 affiliate 链接、加 UTM、做简单追踪，而不需要改动页面组件里的链接）。

## 入口规则

- 跳转路由：`/go/<provider-slug>`
- 实现文件：`front/src/pages/go/[slug].astro`
- 数据源：`front/src/data/redirects.json`

页面会根据 `slug` 找到对应的目标 URL，并用 **meta refresh + JS** 立即跳转；同时带 `noindex, nofollow`，避免被搜索引擎收录。

## redirects.json 格式

文件：`front/src/data/redirects.json`

```jsonc
{
  "providers": {
    "netnut": {
      "url": "https://netnut.io",
      "affiliate": null,
    },
  },
}
```

字段说明：

- `url`：官网/默认落地页（不带 affiliate 时使用）
- `affiliate`：affiliate 链接（优先级更高；为 `null` 时表示不启用）

解析逻辑（简述）：`targetUrl = affiliate || url`

说明：

- `redirects.json` 可以是“全量”（每个 provider 都配一条）或“部分”（只放需要 affiliate/覆盖 URL 的 provider）。
- 当 `redirects.json` 没有该 `slug` 的条目时，会自动回退到 `front/src/data/providers.json` 里的 `website_url`。

## 常见操作

### 1) 给某个 Provider 配置 affiliate

把对应 `slug` 的 `affiliate` 从 `null` 改为你的 affiliate URL：

```jsonc
"netnut": {
  "url": "https://netnut.io",
  "affiliate": "https://netnut.io/?ref=YOUR_CODE"
}
```

也可以直接在 affiliate URL 上手动加 UTM，例如：

```text
https://netnut.io/?ref=YOUR_CODE&utm_source=proxyprice&utm_medium=go&utm_campaign=pricing
```

### 2) 仅更新官网跳转地址（不启用 affiliate）

只改 `url`，保持 `affiliate: null` 即可。

### 3) 新增 Provider 的跳转

要求：如果你在 `redirects.json` 里新增 key，必须和 `front/src/data/providers.json` 里的 `provider.slug` 一致。

新增步骤：

1. 确认/创建 `provider.slug`
2. （可选）如果需要 affiliate 或覆盖 URL，在 `front/src/data/redirects.json` 的 `providers` 下新增同名条目（至少包含 `url` 或 `affiliate` 其一）

## 本地验证

1. 启动开发环境：`cd front && npm run dev`
2. 打开示例：`http://localhost:4321/go/netnut`
3. 生产构建检查：`cd front && npm run build`
