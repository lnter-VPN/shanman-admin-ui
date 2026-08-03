# 闪漫 AI 管理后台 UI

这是闪漫 AI 单管理员后台的静态 UI，可由 GitHub Pages 免费提供 `github.io` 公网地址和 HTTPS。

## 重要说明

- 本仓库只包含浏览器 UI，不包含数据库、管理员密码、许可证私钥或客户数据。
- GitHub Pages 不能运行 Fastify、PostgreSQL、登录、上传、许可证签名和统计 API。
- 登录页中的“后台 API 地址”必须填写独立的 HTTPS 服务地址；远程 HTTP 地址会被拒绝。
- 后台服务的 `WEB_ORIGIN` 需允许此 Pages 站点来源，例如 `https://lnter-vpn.github.io`。
- 智能体页面已包含网页制作器，可设置提示词、模型、工作区权限和专属技能；需同步升级后台 API 和数据库迁移 `005_agent_web_builder.sql`。

## 部署

推送到 `main` 分支后，工作流会上传站点文件并部署 GitHub Pages。首次使用需在仓库 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。

默认地址格式：`https://lnter-vpn.github.io/shanman-admin-ui/`
