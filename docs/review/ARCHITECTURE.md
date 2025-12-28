# 架构审阅与优化建议（ProxyPrice）

更新时间：2025-12-28

## 当前架构概览

- 前端：Astro 静态站 + Preact Island（仅计算器交互）
- 数据：`docs/Price.csv` → `backend/scripts/*.py` 生成 `front/src/data/*.json`
- 部署：静态产物 `front/dist/`（适配 Cloudflare Pages 等 CDN）

## 关键问题（需要修正以达生产级）

1. **“纯静态”与 Cloudflare SSR 适配器混用**
   - 目前启用 `@astrojs/cloudflare` 适配器会引入 KV Session binding 的提示与潜在配置要求。
   - 站点为纯静态输出时，应尽量避免引入 SSR 运行时依赖与误导性配置。
2. **数据更新时间与内容一致性**
   - `last_updated` 当前由脚本硬编码，容易出现“数据已更新但页面文案仍旧日期”的情况。
   - 应由脚本基于执行时间或源数据文件 mtime 自动生成。
3. **“不可比”数据的展示策略**
   - 大部分记录为 per-ip/per-proxy/per-thread，不应与 per-gb 同表排序混淆。
   - 详情页/表格需要明确标识与分区（Comparable vs Non-comparable）。

## 建议的工程化改造（P0）

- 统一“站点元数据”来源：把 `last_updated`/统计信息作为单一来源（JSON）。
- 数据管道输出：
  - 自动写入 `last_updated`（ISO date）
  - 保持字段稳定（便于前端类型推导与未来自动化）
- 前端渲染策略：
  - 列表只排序/展示 `comparable === true`
  - 详情页对 `comparable === false` 的 tiers 采用独立表格（按 pricing_model 渲染不同列），或降级为“说明 + 外链”。
- 部署策略：
  - Astro 维持 `output: "static"`，不启用 Cloudflare SSR adapter（除非未来确实需要 SSR 功能）。

## 安全与合规（建议）

- 增加静态安全 headers（例如 `X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`）。
- 站内加入免责声明：数据可能变化、可能存在误差；鼓励反馈更正。

## 性能建议（当前已基本达标）

- 保持 Islands 最小化（计算器即可）；其他排序/筛选优先用轻量脚本或纯 CSS/HTML。
- 避免无用 preconnect（如果不加载 Google Fonts，则移除预连接）。
