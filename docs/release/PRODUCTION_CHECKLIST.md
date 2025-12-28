# 生产上线检查清单（ProxyPrice）

## 构建与数据

- `python3 backend/scripts/run_pipeline.py` 可运行并更新 `front/src/data/*.json`
- `cd backend && pytest`
- `cd front && npm run verify`

## 页面与链接

- 站内无 404：`/providers`、4 个类型页、`/calculator`、所有 `/provider/<slug>/`
- 站内无断链：`npm run linkcheck` 通过
- `robots.txt`、`sitemap-index.xml`、`og-image.svg`、`CNAME` 均存在且可访问
- 设置 `PUBLIC_FEEDBACK_URL` 后，Footer 的 “Report a Correction” 指向正确的 GitHub Issues URL

## SEO

- canonical 指向 `https://proxyprice.com/...`
- title/description 覆盖首页、列表页、详情页、类型页
- Provider 页包含 BreadcrumbList JSON-LD

## 体验与可访问性

- 移动端导航可用（至少保留 Providers + Calculator）
- 键盘可用（Skip link / focus）
- 对比表筛选/排序在大数据量下仍流畅
