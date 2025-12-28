# GitHub Pages 部署（proxyprice.com）

## 目标

把前端（`front/`）部署到 GitHub Pages，并绑定自定义域名 `proxyprice.com`。

## 仓库要求

- 分支：`main`
- 启用 GitHub Pages：Settings → Pages → Source 选择 “GitHub Actions”

## 必备文件

- `front/public/CNAME`：已设置为 `proxyprice.com`
- `front/public/.nojekyll`：禁用 Jekyll 处理
- `.github/workflows/pages.yml`：CI 构建并部署 `front/dist`

## 纠错入口（GitHub Issues）

在仓库 Settings → Variables → Actions 添加变量：

- `PUBLIC_FEEDBACK_URL` = `https://github.com/<owner>/<repo>/issues/new/choose`

构建时会把 Footer 的 “Report a Correction” 链接指向该地址。

## DNS 设置（在域名解析商）

按 GitHub Pages 自定义域名说明设置 DNS：

- 推荐用 A/AAAA 或 CNAME（取决于你使用 apex/root domain 的方式）

完成后，在 GitHub Pages 配置页勾选 “Enforce HTTPS”。

## 是否需要推送后端？

不需要。GitHub Pages 只托管静态产物（`front/dist`）。

- 你可以把整个仓库推到 GitHub（后端脚本仅用于本地生成数据）
- 或者创建一个“仅前端仓库”：把 `front/` 作为仓库根目录，再把 `.github/` 与 `docs/release/` 复制进去，并把工作流里的 `working-directory: front` 去掉
