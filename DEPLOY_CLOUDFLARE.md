# Cloudflare Pages 部署指南

## 为什么选择 Cloudflare Pages？

| 特性 | Vercel | Cloudflare Pages |
|------|--------|------------------|
| 国内访问速度 | ❌ 慢（海外节点） | ✅ 快（全球 CDN） |
| 免费额度 | 100GB 带宽/月 | 无限带宽 |
| 构建次数 | 100 次/天 | 500 次/月 |
| SSR 支持 | ✅ | ✅ |
| 环境变量 | ✅ | ✅ |
| 日志查看 | ✅ | ✅ |

---

## 部署步骤

### Step 1: 推送代码到 GitHub

```bash
# 确保所有修改已提交
git add .
git commit -m "[M5] Cloudflare Pages 部署配置"
git push origin main
```

### Step 2: 创建 Cloudflare Pages 项目

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 登录账号（如无账号可免费注册）
3. 点击左侧菜单 **Workers & Pages**
4. 点击 **Create application**
5. 选择 **Pages** → **Connect to Git**
6. 选择你的 GitHub 仓库并授权

### Step 3: 配置构建设置

在构建设置页面填写：

| 配置项 | 值 |
|--------|-----|
| **Framework preset** | Next.js |
| **Build command** | `next build` |
| **Build output directory** | `.next` |
| **Install command** | `npm install` |
| **Root directory** | `/` (项目根目录) |

### Step 4: 配置环境变量

进入 **Settings** → **Environment variables**，添加以下变量：

#### Production 环境变量

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qoagemxoijruustccapl.supabase.co` | Supabase 项目地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | *(从 Supabase Dashboard 获取)* | ⚠️ 敏感密钥 |
| `LLM_API_URL` | `https://ddshub.cc/v1` | 呆呆兽中转站地址 |
| `LLM_API_KEY` | `sk-98ec263d78dd6c0e151584bdaeef0ad901f110c0dd9d95002d72a161b8bfcff5` | ⚠️ 敏感密钥 |
| `LLM_MODEL` | `gpt-5.6-terra` | 使用的模型 |
| `NODE_ENV` | `production` | 生产环境标识 |

#### Preview 环境变量（可选）

配置同上，用于预览部署。

### Step 5: 部署

点击 **Save and Deploy**，等待构建完成（通常 2-5 分钟）。

---

## 验证部署

部署成功后，Cloudflare 会分配一个子域名，格式：`your-project.pages.dev`

### 测试清单

- [ ] 打开首页，页面正常加载
- [ ] 选择身份（初一/初二/初三）
- [ ] 输入访问码并注册
- [ ] 完成 Day1/Day2/Day3 答题
- [ ] 提交生成报告
- [ ] 报告页面正常显示：
  - [ ] 综合错因归纳
  - [ ] 模块掌握度
  - [ ] 素养雷达图
  - [ ] **错题分析**
  - [ ] 4周干预计划
  - [ ] 行动清单
- [ ] LLM 生成内容中 KP 代码已转换为中文

---

## 常见问题

### Q1: 构建失败，提示 `@/lib/prisma` 找不到？

已在 `next.config.mjs` 中配置 webpack 路径别名，确保 Cloudflare Pages 构建时能正确解析 `@` 别名。

### Q2: API 路由返回 404？

Cloudflare Pages 支持 Next.js API 路由，但需要确保：
- 构建配置正确（Framework preset: Next.js）
- 没有自定义 `_redirects` 规则干扰 API

### Q3: LLM 调用超时？

呆呆兽中转站的 LLM API 需要通过 HTTPS 443 端口访问，Cloudflare Pages 支持出站 HTTPS 请求。

### Q4: 国内访问仍然慢？

Cloudflare Pages 默认域名在国内访问速度优于 Vercel，但如需更快可考虑：
- 绑定自定义域名
- 使用 Cloudflare 中国节点
- 通过国内 CDN 中转

---

## 与 Vercel 对比

| 步骤 | Vercel | Cloudflare Pages |
|------|--------|------------------|
| 国内访问 | 慢 | 较快 |
| 部署方式 | 自动（git push） | 自动（git push） |
| 环境变量 | Dashboard 配置 | Dashboard 配置 |
| 日志查看 | 需要升级 | 免费 |
| 回滚 | Preview 部署 | Preview 部署 |

---

## 资源链接

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Next.js on Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-nextjs-site/)
- [呆呆兽中转站](https://www.ddshub.cc/)
- [Supabase Dashboard](https://app.supabase.io/project/qoagemxoijruustccapl)
