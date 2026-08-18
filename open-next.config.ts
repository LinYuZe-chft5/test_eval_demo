/**
 * OpenNext Cloudflare 配置
 * 目标：让 OpenNext 构建的静态资源路径与 wrangler [assets] directory 匹配
 */
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({
  // 启用 Node.js 兼容（Prisma + pg + LLM SDK 都需要）
  nodejsCompat: true,

  build: {
    // 把 Next.js 构建的公共静态资源统一输出到 .open-next/assets 子目录
    // 与 wrangler.toml [assets] directory 保持一致
    outputDir: '.open-next',
  },

  router: {
    // 对 /_next/*、图片、字体、favicon 等静态请求，优先走 ASSETS 绑定返回文件
    staticStrategy: 'assets',
  },
});
